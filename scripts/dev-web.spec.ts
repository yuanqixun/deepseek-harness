import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TsdownBundle } from 'tsdown'
import { writeClientBuildRecord } from './client-build-environment.ts'
import {
  devWebBuildEnvironment,
  discoverLibraryDirs,
  discoverPluginDirs,
  parseDevWebArguments,
  preparePrivateMarketOverlay,
  StageSupervisor,
  webProfileArguments,
  watchClientPlugins,
} from './dev-web.ts'
import type { StageHandle } from './dev-web.ts'

/** A stage double that exits only on the listed signals or an explicit exit code. */
function fakeStage(name: string, exitOn: readonly NodeJS.Signals[]): {
  handle: StageHandle
  signals: NodeJS.Signals[]
  exit: (code: number) => void
} {
  const exit = Promise.withResolvers<number | null>()
  const signals: NodeJS.Signals[] = []
  return {
    handle: {
      name,
      exited: exit.promise,
      kill(signal) {
        signals.push(signal)
        if (exitOn.includes(signal)) exit.resolve(null)
      },
    },
    signals,
    exit: (code) => { exit.resolve(code) },
  }
}

describe('StageSupervisor', () => {
  it('reports a stage that exits on its own', async () => {
    const stale: [string, number | null][] = []
    const supervisor = new StageSupervisor((name, code) => { stale.push([name, code]) })
    const tsc = fakeStage('tsc', ['SIGTERM'])
    supervisor.add(tsc.handle)
    tsc.exit(2)
    await tsc.handle.exited
    expect(stale).toEqual([['tsc', 2]])
  })

  it('forwards one signal, escalates survivors after the grace period, and reports none of them', async () => {
    const stale: string[] = []
    const supervisor = new StageSupervisor((name) => { stale.push(name) })
    const polite = fakeStage('vite', ['SIGTERM'])
    const stubborn = fakeStage('dsh web', ['SIGKILL'])
    supervisor.add(polite.handle)
    supervisor.add(stubborn.handle)
    await supervisor.stop({ signal: 'SIGTERM', graceMs: 20 })
    expect(polite.signals).toEqual(['SIGTERM'])
    expect(stubborn.signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(stale).toEqual([])
  })

  it('waits for stages the terminal already interrupted before signaling survivors', async () => {
    const supervisor = new StageSupervisor(() => { throw new Error('unexpected stale report') })
    const interrupted = fakeStage('tsdown', [])
    const survivor = fakeStage('dsh web', ['SIGTERM'])
    supervisor.add(interrupted.handle)
    supervisor.add(survivor.handle)
    const stopping = supervisor.stop({ graceMs: 20 })
    interrupted.exit(130)
    await stopping
    expect(interrupted.signals).toEqual([])
    expect(survivor.signals).toEqual(['SIGTERM'])
  })
})

describe('parseDevWebArguments', () => {
  it('builds, serves, and watches natively by default', () => {
    expect(parseDevWebArguments([])).toEqual({
      configEnvironment: undefined,
      skipBuild: false,
      serve: true,
      pollInterval: undefined,
      appArgs: [],
    })
  })

  it('reads the polling interval with its 500ms default', () => {
    expect(parseDevWebArguments(['--poll']).pollInterval).toBe(500)
    expect(parseDevWebArguments(['--poll=250']).pollInterval).toBe(250)
  })

  it.each(['--poll=abc', '--poll=0', '--poll=-5', '--poll=1.5'])('rejects the polling interval %s', (flag) => {
    expect(() => parseDevWebArguments([flag])).toThrow(`invalid --poll interval "${flag}"`)
  })

  it('separates its own flags from the arguments forwarded to dsh web', () => {
    expect(parseDevWebArguments(['--skip-build', '--poll', '--no-open', '--port', '8080'])).toEqual({
      configEnvironment: undefined, skipBuild: true, serve: true, pollInterval: 500, appArgs: ['--no-open', '--port', '8080'],
    })
  })

  it('consumes one named configuration selector without forwarding it to dsh web', () => {
    expect(parseDevWebArguments(['--config-env', 'hxfl', '--no-open'])).toEqual({
      configEnvironment: 'hxfl', skipBuild: false, serve: true, pollInterval: undefined, appArgs: ['--no-open'],
    })
    expect(parseDevWebArguments(['--config-env=superbpm']).configEnvironment).toBe('superbpm')
    expect(() => parseDevWebArguments(['--config-env'])).toThrow(/requires a name/u)
    expect(() => parseDevWebArguments(['--config-env', 'hxfl', '--config-env', 'superbpm'])).toThrow(/may be specified once/u)
  })

  it('puts launcher overlays before Web profile arguments', () => {
    expect(webProfileArguments(parseDevWebArguments(['--no-open']), '/tmp/private-market.patch')).toEqual([
      'web', '--patch', '/tmp/private-market.patch', '--no-open',
    ])
    expect(webProfileArguments(parseDevWebArguments(['--no-open']), undefined)).toEqual(['web', '--no-open'])
  })

  it('runs only the rebuild watchers with --no-serve', () => {
    expect(parseDevWebArguments(['--no-serve', '--skip-build'])).toMatchObject({ serve: false, skipBuild: true })
  })

  it('ignores the separator pnpm run forwards verbatim', () => {
    expect(parseDevWebArguments(['--', '--no-open']).appArgs).toEqual(['--no-open'])
    expect(parseDevWebArguments(['--no-serve', '--'])).toMatchObject({ serve: false, appArgs: [] })
  })

  it('rejects dsh web arguments when no server is started', () => {
    expect(() => parseDevWebArguments(['--no-serve', '--no-open'])).toThrow('--no-serve leaves no dsh web process for --no-open')
  })
})

it('creates a private-market overlay with temporary profile resolution and restores profile state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-private-market-overlay-'))
  try {
    const source = join(root, 'plugin')
    const configRoot = join(root, 'environments')
    await mkdir(source, { recursive: true })
    await mkdir(join(source, 'lib'), { recursive: true })
    await mkdir(join(source, 'node_modules'), { recursive: true })
    await mkdir(join(configRoot, 'hxfl'), { recursive: true })
    await writeFile(join(source, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-private-market',
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    }))
    await writeFile(join(source, 'lib', 'index.js'), 'export function apply() {}\n')
    await writeFile(join(source, 'lib', 'client.js'), 'export {}\n')
    await writeFile(join(source, 'lib', 'typert.host.js'), 'export {}\n')
    await writeFile(join(source, 'lib', 'typert.remote-client.js'), 'export {}\n')
    await writeFile(join(configRoot, 'hxfl', 'config.json'), JSON.stringify({
      schemaVersion: 1,
      environment: 'hxfl',
      plugins: { privateMarket: {
        catalogUrl: 'https://market.example/catalog.json',
        catalogCredentialRef: 'MARKET_TOKEN',
        registryUrl: 'https://npm.example/',
      } },
      desktop: { updateUrl: 'https://updates.example/' },
    }))
    const profile = join(root, 'profile')
    await mkdir(profile, { recursive: true })
    const profileManifestPath = join(profile, 'package.json')
    await writeFile(profileManifestPath, '{\n  "name": "test-profile",\n  "dependencies": {}\n}\n')
    const originalProfileManifest = await readFile(profileManifestPath, 'utf8')
    const { overlay, directory, profileLink, restoreProfile } = preparePrivateMarketOverlay(
      source, configRoot, 'hxfl', profile, join(root, 'runtime/@deepseek-ai'),
    )
    try {
      const text = await readFile(overlay, 'utf8')
      expect(text).toContain('https://market.example/catalog.json')
      expect(text).toContain('https://npm.example/')
      expect(text).not.toContain('updates.example')
      expect(text).not.toContain('MARKET_TOKEN_VALUE')
      expect(text).toContain('@deepseek-ai/dsh-private-market')
      expect(JSON.parse(text)).toContainEqual(expect.objectContaining({
        id: 'private-market',
        name: '@deepseek-ai/dsh-private-market',
        config: {
          catalogUrl: 'https://market.example/catalog.json',
          catalogCredentialRef: 'MARKET_TOKEN',
        },
      }))
      expect(JSON.parse(text).filter((patch: { id?: string }) => patch.id === 'private-market')).toHaveLength(1)
      expect(text).not.toContain(join(directory, 'lib', 'index.js'))
      expect(await readlink(join(directory, 'node_modules'))).toBe(join(source, 'node_modules'))
      expect(await readlink(profileLink)).toBe(directory)
      expect(JSON.parse(await readFile(profileManifestPath, 'utf8'))).toMatchObject({
        dependencies: { '@deepseek-ai/dsh-private-market': `link:${directory}` },
      })
    } finally {
      restoreProfile()
      expect(await readFile(profileManifestPath, 'utf8')).toBe(originalProfileManifest)
      rmSync(profileLink, { force: true })
      rmSync(directory, { recursive: true, force: true })
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('samples one local environment at startup without validating watcher outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-web-environment-'))
  try {
    await mkdir(join(root, 'apps/web/dist'), { recursive: true })
    await mkdir(join(root, 'packages/client/example/lib'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    await writeFile(join(root, 'apps/web/dist/index.html'), '<main></main>')
    await writeFile(join(root, 'packages/client/example/lib/client.js'), 'module.exports = {}\n')
    writeClientBuildRecord(root, {
      DSH_CLIENT_BUILD_PROFILE: 'official',
      DSH_CLIENT_COMMIT_HASH: 'fffffff',
      DSH_CLIENT_TITLE: 'DeepSeek Harness',
      DSH_CLIENT_VERSION: '1.2.2',
    })
    await writeFile(join(root, 'packages/client/example/lib/client.js'), 'module.exports = { changed: true }\n')

    expect(devWebBuildEnvironment(root, {
      PATH: '/bin',
      DSH_BUILD_CLIENT_PROFILE: 'official',
      DSH_CLIENT_COMMIT_HASH: 'abc1234',
      DSH_CLIENT_EXTRA: 'launch-value',
    })).toEqual({
      PATH: '/bin',
      DSH_CLIENT_COMMIT_HASH: 'abc1234',
      DSH_CLIENT_EXTRA: 'launch-value',
      DSH_CLIENT_VERSION: '1.2.3',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('discovers dsh.client packages with sibling roles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-web-discovery-'))
  try {
    const current = join(root, 'packages', 'client', 'current')
    await mkdir(current, { recursive: true })
    await writeFile(join(current, 'package.json'), JSON.stringify({
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web' },
        profile: { bundles: [] },
      },
    }))

    expect(discoverPluginDirs(root)).toEqual(['packages/client/current'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('discovers client-preset packages the shell links, excluding loader-delivered and test infrastructure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-web-library-'))
  try {
    const write = async (dir: string, manifest: unknown, config: string): Promise<void> => {
      await mkdir(join(root, dir), { recursive: true })
      await writeFile(join(root, dir, 'package.json'), JSON.stringify(manifest))
      await writeFile(join(root, dir, 'tsdown.config.ts'), config)
    }
    const clientPreset = "import { clientLibrary } from '../tsdown.client.ts'\nexport default clientLibrary('x', [])\n"

    // Linked by the compile shell: client preset, no loader-delivered half.
    await write('packages/client/linked', {}, clientPreset)
    // Loader-delivered: discoverPluginDirs owns it, so it must not appear twice.
    await write('packages/client/delivered', { dsh: { client: { platform: 'web' } } }, clientPreset)
    // Test infrastructure builds through the preset but never enters the shell graph.
    await write('packages/test-support/harness', {}, clientPreset)
    // Host package with its own config: not a client-face build at all.
    await write('packages/host/server', {}, "import { defineConfig } from 'tsdown'\nexport default defineConfig({})\n")

    expect(discoverLibraryDirs(root)).toEqual(['packages/client/linked'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('rebuilds a client-plugin bundle after its source changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-web-watch-'))
  let bundles: TsdownBundle[] = []
  try {
    await symlink(join(import.meta.dirname, '..', 'node_modules'), join(root, 'node_modules'), 'dir')
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@dsh-test/dev-web-watch', private: true, type: 'module' }))
    await writeFile(join(root, 'tsdown.config.ts'), `
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: { client: 'src.ts' }, outDir: 'lib', format: 'cjs', platform: 'browser', dts: false, clean: false,
  outputOptions: { entryFileNames: 'client.js' },
  hooks: { 'build:done': async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(new URL('./hook-complete', import.meta.url), 'ready')
  } },
})
`)
    const sourcePath = join(root, 'src.ts')
    const bundlePath = join(root, 'lib/client.js')
    await writeFile(sourcePath, 'export const version = "watch-v1"\n')
    bundles = await watchClientPlugins(root, ['.'], 50)
    expect(await readFile(bundlePath, 'utf8')).toContain('watch-v1')
    expect(await readFile(join(root, 'hook-complete'), 'utf8')).toBe('ready')

    await new Promise(resolve => setTimeout(resolve, 1_000))
    await writeFile(sourcePath, `export const version = "watch-v2-${'x'.repeat(100)}"\n`)
    await expect.poll(async () => (await readFile(bundlePath, 'utf8')).includes('watch-v2-'), {
      timeout: 10_000,
    }).toBe(true)
  } finally {
    for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)

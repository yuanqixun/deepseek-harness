import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertPrivateMarketPeerCompatibility, packagePrivateMarket, privateMarketCliManifest } from '../scripts/private-market-package.ts'

describe('private market Desktop manifest', () => {
  it('adds an exact package dependency and optional Official bundle without mutating the source manifest', () => {
    const source: Record<string, unknown> = {
      name: '@deepseek-ai/dsh',
      dependencies: {
        '@deepseek-ai/dsh-base': 'workspace:*',
        '@deepseek-ai/cordis': 'workspace:~',
      },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] }, optionalBundles: ['@deepseek-ai/other'] },
    }
    const packed = privateMarketCliManifest(source, new Map([
      ['@deepseek-ai/dsh-base', '0.2.1-alpha.1'],
      ['@deepseek-ai/cordis', '4.0.5-alpha.1'],
    ]), '0.1.0')
    expect(packed.dependencies).toEqual({
      '@deepseek-ai/dsh-base': '0.2.1-alpha.1',
      '@deepseek-ai/cordis': '4.0.5-alpha.1',
      '@deepseek-ai/dsh-private-market': '0.1.0',
    })
    expect(packed.dsh).toMatchObject({
      profile: { bundles: ['@deepseek-ai/dsh-base'] },
      optionalBundles: ['@deepseek-ai/other', '@deepseek-ai/dsh-private-market'],
    })
    expect(source.dependencies).toMatchObject({ '@deepseek-ai/dsh-base': 'workspace:*' })
    expect(source.dsh).toEqual({ profile: { bundles: ['@deepseek-ai/dsh-base'] }, optionalBundles: ['@deepseek-ai/other'] })
  })

  it('refuses a workspace dependency without its exact package version', () => {
    expect(() => privateMarketCliManifest({ dependencies: { '@deepseek-ai/unknown': 'workspace:*' } }, new Map(), '0.1.0'))
      .toThrow(/no workspace version/u)
  })

  it('rejects a plugin peer range that excludes the packaged DSH dependency', () => {
    expect(() => {
      assertPrivateMarketPeerCompatibility(
        { peerDependencies: { '@deepseek-ai/dsh-plugin-manager': '^1.0.0' } },
        new Map([['@deepseek-ai/dsh-plugin-manager', '0.2.1-alpha.1']]),
      )
    })
      .toThrow(/does not satisfy plugin peer range/u)
  })

  it('packs only the selected market config and replaces the ordinary CLI tarball', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-pack-'))
    try {
      const repository = join(root, 'dsh')
      const source = join(root, 'plugin')
      const configRoot = join(root, 'config')
      const output = join(root, 'packed')
      await mkdir(join(repository, 'apps/cli/lib'), { recursive: true })
      await mkdir(join(repository, 'packages/test/sample'), { recursive: true })
      await mkdir(join(source, 'lib'), { recursive: true })
      await mkdir(join(configRoot, 'hxfl'), { recursive: true })
      await writeFile(join(repository, 'apps/cli/package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh', version: '1.0.0', files: ['lib/*.js'],
        dependencies: { '@deepseek-ai/test': 'workspace:*' },
      }))
      await writeFile(join(repository, 'apps/cli/lib/bin.js'), 'export {}\n')
      await writeFile(join(repository, 'packages/test/sample/package.json'), JSON.stringify({ name: '@deepseek-ai/test', version: '2.0.0' }))
      await writeFile(join(source, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-private-market', version: '0.1.0', files: ['lib/*.js', 'cordis.patch.yml'],
        dependencies: { '@deepseek-ai/test': 'workspace:*' },
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      }))
      await writeFile(join(source, 'lib/index.js'), 'export {}\n')
      await writeFile(join(source, 'lib/client.js'), 'export {}\n')
      await writeFile(join(source, 'lib/typert.host.js'), 'export {}\n')
      await writeFile(join(source, 'lib/typert.remote-client.js'), 'export {}\n')
      await writeFile(join(configRoot, 'hxfl/config.json'), JSON.stringify({
        schemaVersion: 1, environment: 'hxfl',
        plugins: { privateMarket: {
          catalogUrl: 'https://market.example/catalog.json',
          catalogCredentialRef: 'MARKET_TOKEN',
          registryUrl: 'https://npm.example/',
        } },
        desktop: { updateUrl: 'https://secretly-unrelated.example/' },
      }))
      await mkdir(output, { recursive: true })
      await writeFile(join(output, 'deepseek-ai-dsh-1.0.0.tgz'), 'ordinary-cli')
      const packedManifests: Record<string, Record<string, unknown>> = {}
      const record = await packagePrivateMarket({
        repositoryRoot: repository, source, configRoot, environment: 'hxfl', output,
        runPnpm: async (args, cwd) => {
          const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as Record<string, unknown>
          if (manifest.name === '@deepseek-ai/dsh-private-market') {
            const patch = await readFile(join(cwd, 'cordis.patch.yml'), 'utf8')
            expect(patch).toContain('https://npm.example/')
            expect(patch).toContain('https://market.example/catalog.json')
            expect(patch).not.toContain('unrelated.example')
            expect(patch).not.toContain('MARKET_TOKEN_VALUE')
          }
          packedManifests[String(manifest.name)] = manifest
          const destinationIndex = args.indexOf('--pack-destination')
          const destination = args[destinationIndex + 1]
          if (destination === undefined) throw new Error('missing pack destination')
          await writeFile(join(destination, `${String(manifest.name).replace('@', '').replace('/', '-')}-${String(manifest.version)}.tgz`), JSON.stringify(manifest))
        },
      })
      expect(record).toMatchObject({ environment: 'hxfl', package: '@deepseek-ai/dsh-private-market', version: '0.1.0' })
      const packedCli = packedManifests['@deepseek-ai/dsh']
      if (packedCli === undefined) throw new Error('missing packed DSH CLI manifest')
      expect(packedCli.dependencies).toEqual({
        '@deepseek-ai/test': '2.0.0', '@deepseek-ai/dsh-private-market': '0.1.0',
      })
      expect(packedCli.dsh).toEqual({ optionalBundles: ['@deepseek-ai/dsh-private-market'] })
      expect(await readFile(join(output, 'deepseek-ai-dsh-1.0.0.tgz'), 'utf8')).not.toBe('ordinary-cli')
      expect(await readFile(join(output, 'private-market-build.json'), 'utf8')).not.toContain('unrelated.example')
      expect(await readFile(join(output, 'private-market-build.json'), 'utf8')).not.toContain('MARKET_TOKEN_VALUE')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})

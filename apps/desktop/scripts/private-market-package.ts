/** Build a selected private-market deployment into a self-contained Desktop package input. */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, globSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { satisfies } from 'semver'
import { readPrivateMarketEnvironment } from '../../../scripts/config-environment.ts'

const PRIVATE_MARKET = '@deepseek-ai/dsh-private-market'
const DSH_CLI = '@deepseek-ai/dsh'

/** Immutable identity written to the Desktop packaging record. */
export interface PrivateMarketPackageRecord {
  readonly environment: string
  readonly configDigest: string
  readonly package: string
  readonly version: string
  readonly integrity: string
}

/**
 * Convert workspace ranges to exact package versions for a standalone CLI tarball.
 * @param manifest - Source CLI package manifest.
 * @param versions - Workspace package versions by package name.
 * @param privateMarketVersion - Selected private-market package version.
 * @returns CLI manifest suitable for packing outside the workspace.
 */
export function privateMarketCliManifest(
  manifest: Record<string, unknown>,
  versions: ReadonlyMap<string, string>,
  privateMarketVersion: string,
): Record<string, unknown> {
  const result = structuredClone(manifest)
  resolveWorkspaceRanges(result, versions)
  const dependencies = result.dependencies as Record<string, string>
  dependencies[PRIVATE_MARKET] = privateMarketVersion
  const dsh = typeof result.dsh === 'object' && result.dsh !== null ? result.dsh as Record<string, unknown> : {}
  const optional = Array.isArray(dsh.optionalBundles) ? dsh.optionalBundles.filter((name): name is string => typeof name === 'string') : []
  result.dsh = { ...dsh, optionalBundles: [...new Set([...optional, PRIVATE_MARKET])] }
  return result
}

function resolveWorkspaceRanges(manifest: Record<string, unknown>, versions: ReadonlyMap<string, string>): void {
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    const value = manifest[section]
    if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const dependencies = value as Record<string, unknown>
    for (const [name, spec] of Object.entries(dependencies)) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue
      const version = versions.get(name)
      if (version === undefined) throw new Error(`private market packaging: no workspace version for ${name}`)
      dependencies[name] = version
    }
  }
}

/**
 * Reject a private plugin built for incompatible first-party package versions.
 * @param manifest - Private market package manifest.
 * @param versions - DSH workspace package versions.
 */
export function assertPrivateMarketPeerCompatibility(
  manifest: Record<string, unknown>,
  versions: ReadonlyMap<string, string>,
): void {
  const peers = manifest.peerDependencies
  if (peers === undefined || peers === null || typeof peers !== 'object' || Array.isArray(peers)) return
  for (const [name, range] of Object.entries(peers)) {
    const version = versions.get(name)
    if (version === undefined || typeof range !== 'string') continue
    if (!satisfies(version, range, { includePrerelease: true })) {
      throw new Error(`private market packaging: ${name}@${version} does not satisfy plugin peer range ${range}`)
    }
  }
}

function workspaceVersions(repositoryRoot: string): Map<string, string> {
  const versions = new Map<string, string>()
  for (const path of globSync(['packages/*/*/package.json', 'vendor/*/package.json', 'native/*/package.json', 'apps/*/package.json'], { cwd: repositoryRoot })) {
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as { name?: unknown; version?: unknown }
    if (typeof manifest.name === 'string' && typeof manifest.version === 'string') versions.set(manifest.name, manifest.version)
  }
  return versions
}

function packageIntegrity(path: string): string {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
}

function oneTarball(directory: string): string {
  const files = readdirSync(directory).filter(name => name.endsWith('.tgz'))
  if (files.length !== 1) throw new Error(`private market packaging: expected one tarball in ${directory}`)
  return join(directory, files[0] as string)
}

/**
 * Pack the independent plugin and a Desktop-specific DSH CLI manifest.
 * @param options - Source, environment, output and the caller-owned pnpm runner.
 * @returns Artifact identity for the Desktop release record.
 */
export async function packagePrivateMarket(options: {
  readonly repositoryRoot: string
  readonly source: string
  readonly configRoot: string | undefined
  readonly environment: string
  readonly output: string
  readonly runPnpm: (args: readonly string[], cwd: string) => Promise<void>
}): Promise<PrivateMarketPackageRecord> {
  const { repositoryRoot, source, output, environment } = options
  const settings = readPrivateMarketEnvironment(options.configRoot, environment)
  const pluginManifestPath = join(source, 'package.json')
  const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, 'utf8')) as Record<string, unknown>
  if (pluginManifest.name !== PRIVATE_MARKET || typeof pluginManifest.version !== 'string') {
    throw new Error(`private market packaging: invalid plugin package at ${source}`)
  }
  const declaration = typeof pluginManifest.dsh === 'object' && pluginManifest.dsh !== null
    ? pluginManifest.dsh as Record<string, unknown> : {}
  const bundle = typeof declaration.bundle === 'object' && declaration.bundle !== null
    ? declaration.bundle as Record<string, unknown> : {}
  const client = typeof declaration.client === 'object' && declaration.client !== null
    ? declaration.client as Record<string, unknown> : {}
  if (bundle.patch !== './cordis.patch.yml' || client.platform !== 'web') {
    throw new Error(`private market packaging: ${source} must declare its bundle patch and Web Client`)
  }
  const cliManifestPath = join(repositoryRoot, 'apps/cli/package.json')
  const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8')) as Record<string, unknown>
  if (cliManifest.name !== DSH_CLI) throw new Error('private market packaging: unexpected DSH CLI package')
  const cliVersion = typeof cliManifest.version === 'string' ? cliManifest.version : ''
  const stage = mkdtempSync(join(tmpdir(), 'dsh-private-market-pack-'))
  const pluginStage = join(stage, 'plugin')
  const cliStage = join(stage, 'cli')
  const pluginOutput = join(stage, 'plugin-output')
  const cliOutput = join(stage, 'cli-output')
  mkdirSync(pluginOutput)
  mkdirSync(cliOutput)
  try {
    const excludedPackagePath = /(?:^|[/\\])(?:\.git|node_modules|src|tests|scripts|openspec|\.agents)(?:[/\\]|$)/u
    cpSync(source, pluginStage, {
      recursive: true,
      filter: path => !excludedPackagePath.test(path),
    })
    const versions = workspaceVersions(repositoryRoot)
    const standalonePluginManifest = JSON.parse(readFileSync(pluginManifestPath, 'utf8')) as Record<string, unknown>
    assertPrivateMarketPeerCompatibility(standalonePluginManifest, versions)
    resolveWorkspaceRanges(standalonePluginManifest, versions)
    writeFileSync(join(pluginStage, 'package.json'), `${JSON.stringify(standalonePluginManifest, null, 2)}\n`)
    const patch = [
      { id: 'plugin-manager', config: { registry: settings.registryUrl } },
      { insert: [{ id: 'private-market', name: PRIVATE_MARKET, config: {
        catalogUrl: settings.catalogUrl,
        catalogCredentialRef: settings.catalogCredentialRef ?? '',
      } }] },
    ]
    writeFileSync(join(pluginStage, 'cordis.patch.yml'), `${JSON.stringify(patch, null, 2)}\n`)
    const requiredOutputs = ['lib/index.js', 'lib/client.js', 'lib/typert.host.js', 'lib/typert.remote-client.js']
    const missingOutput = requiredOutputs.find(file => !existsSync(join(pluginStage, file)))
    if (missingOutput !== undefined) {
      throw new Error(`private market packaging: required Host, Remote, or Client output is missing: ${missingOutput}`)
    }
    await options.runPnpm(['pack', '--pack-destination', pluginOutput], pluginStage)
    const pluginTarball = oneTarball(pluginOutput)

    mkdirSync(cliStage)
    cpSync(join(repositoryRoot, 'apps/cli/lib'), join(cliStage, 'lib'), { recursive: true })
    const manifest = privateMarketCliManifest(cliManifest, versions, pluginManifest.version)
    writeFileSync(join(cliStage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await options.runPnpm(['pack', '--pack-destination', cliOutput], cliStage)
    const cliTarball = oneTarball(cliOutput)

    mkdirSync(output, { recursive: true })
    // The ordinary family pack's CLI tarball is identified by its conventional scoped-package filename.
    const expectedCliFilename = `deepseek-ai-dsh-${cliVersion}.tgz`
    const packedCliPath = join(output, expectedCliFilename)
    if (existsSync(packedCliPath)) rmSync(packedCliPath)
    const pluginDestination = join(output, basename(pluginTarball))
    const cliDestination = join(output, basename(cliTarball))
    if (existsSync(pluginDestination)) rmSync(pluginDestination)
    if (existsSync(cliDestination)) rmSync(cliDestination)
    cpSync(pluginTarball, pluginDestination)
    cpSync(cliTarball, cliDestination)
    const record = {
      environment,
      configDigest: settings.digest,
      package: PRIVATE_MARKET,
      version: pluginManifest.version,
      integrity: packageIntegrity(pluginDestination),
    } satisfies PrivateMarketPackageRecord
    writeFileSync(join(output, 'private-market-build.json'), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    return record
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/** Resolve the local sibling checkout or explicit build override. */
export function resolvePrivateMarketSource(repositoryRoot: string, environment: NodeJS.ProcessEnv): string {
  return resolve(environment.DSH_PRIVATE_MARKET_SOURCE ?? join(repositoryRoot, '..', 'deepseek-harness-plugins', 'dsh-private-market'))
}

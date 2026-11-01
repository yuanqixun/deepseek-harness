/** Package local private bundles into a self-contained Desktop runtime input. */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, globSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { satisfies } from 'semver'
import { readPrivateMarketEnvironment } from '../../../scripts/config-environment.ts'

const PRIVATE_MARKET = '@deepseek-ai/dsh-private-market'
const PRO_AUTH = 'dsh-pro-auth'
const MINIMUM_PRO_AUTH_VERSION = '0.1.2'
const DSH_CLI = '@deepseek-ai/dsh'
const DEFAULT_PLUGIN_REGISTRY = 'https://hxflnexus.superbpm.com/repository/npm-group/'

/** Immutable identity written to the Desktop packaging record. */
export interface PrivateMarketPackageRecord {
  readonly environment?: string
  readonly configDigest?: string
  readonly package: string
  readonly version: string
  readonly integrity: string
  readonly preinstalledPlugins: readonly { readonly package: string; readonly version: string; readonly integrity: string }[]
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
  additionalBundles: readonly { readonly name: string; readonly version: string }[] = [],
): Record<string, unknown> {
  const result = structuredClone(manifest)
  resolveWorkspaceRanges(result, versions)
  const dependencies = result.dependencies as Record<string, string>
  dependencies[PRIVATE_MARKET] = privateMarketVersion
  for (const bundle of additionalBundles) dependencies[bundle.name] = bundle.version
  const dsh = typeof result.dsh === 'object' && result.dsh !== null ? result.dsh as Record<string, unknown> : {}
  const optional = Array.isArray(dsh.optionalBundles) ? dsh.optionalBundles.filter((name): name is string => typeof name === 'string') : []
  result.dsh = { ...dsh, optionalBundles: [...new Set([...optional, PRIVATE_MARKET, ...additionalBundles.map(bundle => bundle.name)])] }
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

/** Reject an auth bundle older than the Desktop Aicode Key integration. */
function assertProAuthMinimumVersion(version: string): void {
  if (!satisfies(version, `>=${MINIMUM_PRO_AUTH_VERSION}`)) {
    throw new Error(`private plugin packaging: ${PRO_AUTH}@${version} is too old; HXFL Nexus must provide ${MINIMUM_PRO_AUTH_VERSION} or later`)
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
 * Pack the private market, an optional CAS bundle, and a Desktop-specific DSH CLI manifest.
 * @param options - Source, environment, output and the caller-owned pnpm runner.
 * @returns Artifact identity for the Desktop release record.
 */
export async function packagePrivateMarket(options: {
  readonly repositoryRoot: string
  readonly registryUrl?: string
  readonly includeProAuth?: boolean
  readonly configRoot: string | undefined
  readonly environment?: string
  readonly output: string
  readonly runPnpm: (args: readonly string[], cwd: string) => Promise<void>
}): Promise<PrivateMarketPackageRecord> {
  const { repositoryRoot, output, environment } = options
  const settings = environment === undefined ? undefined : readPrivateMarketEnvironment(options.configRoot, environment)
  const registryUrl = options.registryUrl ?? settings?.registryUrl ?? DEFAULT_PLUGIN_REGISTRY
  const cliManifestPath = join(repositoryRoot, 'apps/cli/package.json')
  const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8')) as Record<string, unknown>
  if (cliManifest.name !== DSH_CLI) throw new Error('private market packaging: unexpected DSH CLI package')
  const cliVersion = typeof cliManifest.version === 'string' ? cliManifest.version : ''
  const stage = mkdtempSync(join(tmpdir(), 'dsh-private-market-pack-'))
  const pluginStage = join(stage, 'plugin')
  const cliStage = join(stage, 'cli')
  const marketDownload = join(stage, 'market-download')
  const pluginOutput = join(stage, 'plugin-output')
  const authStage = join(stage, 'pro-auth')
  const authOutput = join(stage, 'pro-auth-output')
  const cliOutput = join(stage, 'cli-output')
  mkdirSync(pluginOutput)
  mkdirSync(authOutput)
  mkdirSync(cliOutput)
  try {
    const market = await downloadRegistryPackage(PRIVATE_MARKET, registryUrl, marketDownload)
    extractPackage(market.tarball, pluginStage)
    const pluginManifest = readPackageManifest(pluginStage, PRIVATE_MARKET)
    const versions = workspaceVersions(repositoryRoot)
    assertPrivateMarketPeerCompatibility(pluginManifest, versions)
    const declaration = typeof pluginManifest.dsh === 'object' && pluginManifest.dsh !== null
      ? pluginManifest.dsh as Record<string, unknown> : {}
    const bundle = typeof declaration.bundle === 'object' && declaration.bundle !== null ? declaration.bundle as Record<string, unknown> : {}
    const client = typeof declaration.client === 'object' && declaration.client !== null ? declaration.client as Record<string, unknown> : {}
    if (bundle.patch !== './cordis.patch.yml' || client.platform !== 'web') {
      throw new Error(`private market packaging: published ${PRIVATE_MARKET}@${market.version} has an unsupported bundle declaration`)
    }
    const patch = settings === undefined
      ? [{ insert: [{ id: 'private-market', name: PRIVATE_MARKET, config: { catalogUrl: '', catalogCredentialRef: '' } }] }]
      : [
        { id: 'plugin-manager', config: { registry: settings.registryUrl } },
        { insert: [{ id: 'private-market', name: PRIVATE_MARKET, config: {
          catalogUrl: settings.catalogUrl,
          tenantId: settings.tenantId ?? '',
          catalogCredentialRef: settings.catalogCredentialRef ?? '',
        } }] },
      ]
    const requiredOutputs = ['lib/index.js', 'lib/client.js', 'lib/typert.host.js', 'lib/typert.remote-client.js']
    const missingOutput = requiredOutputs.find(file => !existsSync(join(pluginStage, file)))
    if (missingOutput !== undefined) {
      throw new Error(`private market packaging: required Host, Remote, or Client output is missing: ${missingOutput}`)
    }
    writeFileSync(join(pluginStage, 'cordis.patch.yml'), `${JSON.stringify(patch, null, 2)}\n`)
    await options.runPnpm(['pack', '--pack-destination', pluginOutput], pluginStage)
    const pluginTarball = readdirSync(pluginOutput).filter(file => file.endsWith('.tgz')).map(file => join(pluginOutput, file)).find(file => file !== market.tarball)
    if (pluginTarball === undefined) throw new Error('private market packaging: customized registry package tarball was not created')

    const proAuthRecord = options.includeProAuth
      ? await downloadRegistryPackage(PRO_AUTH, registryUrl, authOutput)
      : undefined
    if (proAuthRecord !== undefined) {
      assertProAuthMinimumVersion(proAuthRecord.version)
      extractPackage(proAuthRecord.tarball, authStage)
      const authManifest = readPackageManifest(authStage, PRO_AUTH)
      assertPrivateMarketPeerCompatibility(authManifest, versions)
      const authRequired = ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']
      const missingAuthOutput = authRequired.find(file => !existsSync(join(authStage, file)))
      if (missingAuthOutput !== undefined) throw new Error(`private plugin packaging: published ${PRO_AUTH}@${proAuthRecord.version} omits ${missingAuthOutput}`)
    }

    mkdirSync(cliStage)
    cpSync(join(repositoryRoot, 'apps/cli/lib'), join(cliStage, 'lib'), { recursive: true })
    const manifest = privateMarketCliManifest(cliManifest, versions, market.version,
      proAuthRecord === undefined ? [] : [{ name: PRO_AUTH, version: proAuthRecord.version }])
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
    if (proAuthRecord !== undefined) cpSync(proAuthRecord.tarball, join(output, basename(proAuthRecord.tarball)))
    cpSync(cliTarball, cliDestination)
    const record = {
      ...(environment === undefined ? {} : { environment }),
      ...(settings === undefined ? {} : { configDigest: settings.digest }),
      package: PRIVATE_MARKET,
      version: market.version,
      integrity: packageIntegrity(pluginDestination),
      preinstalledPlugins: [
        { package: PRIVATE_MARKET, version: market.version, integrity: packageIntegrity(pluginDestination) },
        ...(proAuthRecord === undefined ? [] : [
          { package: PRO_AUTH, version: proAuthRecord.version, integrity: packageIntegrity(join(output, basename(proAuthRecord.tarball))) },
        ]),
      ],
    } satisfies PrivateMarketPackageRecord
    writeFileSync(join(output, 'private-market-build.json'), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    return record
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

interface RegistryPackage { readonly tarball: string; readonly version: string; readonly integrity: string }

async function downloadRegistryPackage(name: string, registry: string, output: string): Promise<RegistryPackage> {
  const metadataName = name.startsWith('@') ? name.replace('/', '%2f') : name
  const metadataUrl = new URL(metadataName, registry.endsWith('/') ? registry : `${registry}/`)
  const metadataResponse = await fetch(metadataUrl)
  if (!metadataResponse.ok) throw new Error(`private plugin packaging: registry metadata request failed for ${name} (${metadataResponse.status})`)
  const metadata: unknown = await metadataResponse.json()
  if (!isRecord(metadata) || metadata.name !== name || !isRecord(metadata['dist-tags'])) {
    throw new Error(`private plugin packaging: invalid registry metadata for ${name}`)
  }
  const version = metadata['dist-tags'].latest
  if (typeof version !== 'string' || !isRecord(metadata.versions) || !isRecord(metadata.versions[version])) {
    throw new Error(`private plugin packaging: registry has no latest version for ${name}`)
  }
  const publishedVersion = metadata.versions[version]
  if (!isRecord(publishedVersion)) throw new Error(`private plugin packaging: invalid registry version metadata for ${name}@${version}`)
  const dist = publishedVersion.dist
  if (!isRecord(dist) || typeof dist.tarball !== 'string' || typeof dist.integrity !== 'string') {
    throw new Error(`private plugin packaging: registry metadata has no integrity for ${name}@${version}`)
  }
  const response = await fetch(dist.tarball)
  if (!response.ok) throw new Error(`private plugin packaging: package download failed for ${name}@${version} (${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actualIntegrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (actualIntegrity !== dist.integrity) throw new Error(`private plugin packaging: integrity mismatch for ${name}@${version}`)
  mkdirSync(output, { recursive: true })
  const tarball = join(output, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`)
  writeFileSync(tarball, bytes, { flag: 'wx' })
  return { tarball, version, integrity: actualIntegrity }
}

function extractPackage(tarball: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', destination], { stdio: 'inherit' })
  const packageRoot = join(destination, 'package')
  if (!existsSync(join(packageRoot, 'package.json'))) throw new Error(`private plugin packaging: invalid package archive ${tarball}`)
  const extracted = join(destination, 'extracted')
  cpSync(packageRoot, extracted, { recursive: true })
  rmSync(packageRoot, { recursive: true, force: true })
  // Keep the caller's staging directory as the package root expected by pnpm pack.
  for (const entry of readdirSync(extracted)) cpSync(join(extracted, entry), join(destination, entry), { recursive: true })
  rmSync(extracted, { recursive: true, force: true })
}

function readPackageManifest(directory: string, expectedName: string): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Record<string, unknown>
  if (manifest.name !== expectedName || typeof manifest.version !== 'string') {
    throw new Error(`private plugin packaging: invalid published package ${expectedName}`)
  }
  return manifest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

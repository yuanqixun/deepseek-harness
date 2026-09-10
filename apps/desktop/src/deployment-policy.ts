/** Build-time deployment settings shared by Desktop seed, pnpm, and updater. */

import { existsSync, readFileSync } from 'node:fs'

export const DSH_DESKTOP_DEPLOYMENT_POLICY_FILE = 'DSH_DESKTOP_DEPLOYMENT_POLICY_FILE'
export const OFFICIAL_DESKTOP_NPM_REGISTRY = 'https://registry.npmjs.org/'

export interface DesktopDeploymentPolicy {
  readonly schemaVersion: 1
  readonly name: string
  readonly npmRegistryUrl: string
  readonly updateBaseUrl?: string
  readonly privateMarketUrl?: string
  readonly pipIndexUrl?: string
  readonly defaultProfile?: string
  readonly preinstalledBundles: readonly string[]
  readonly allowedBuilds: Readonly<Record<string, boolean>>
  readonly allowedDomains?: readonly string[]
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u
const PACKAGE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u
const PACKAGE_FILE_TARBALL = /^file:[^\s\\]+\.tgz$/u

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function packageSpec(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  const slash = value.startsWith('@') ? value.indexOf('/') : -1
  const versionAt = value.startsWith('@') ? value.indexOf('@', slash + 1) : value.indexOf('@')
  const name = versionAt === -1 ? value : value.slice(0, versionAt)
  const version = versionAt === -1 ? undefined : value.slice(versionAt + 1)
  return PACKAGE_NAME.test(name)
    && (version === undefined || PACKAGE_VERSION.test(version) || PACKAGE_FILE_TARBALL.test(version))
}

function httpsUrl(value: unknown, field: string, domains: readonly string[] | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`desktop policy: ${field} must be a non-empty URL`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`desktop policy: ${field} must be an absolute HTTPS URL`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`desktop policy: ${field} must use HTTPS`)
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error(`desktop policy: ${field} must not include credentials`)
  }
  if (domains !== undefined && !domains.includes(parsed.hostname)) {
    throw new Error(`desktop policy: ${field} is outside the deployment policy allowlist`)
  }
  return parsed.toString()
}

function domains(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every(domain => typeof domain === 'string' && /^[a-z0-9.-]+$/iu.test(domain))) {
    throw new Error('desktop policy: allowedDomains must contain DNS hostnames')
  }
  return [...new Set(value)].sort()
}

function parse(value: unknown): DesktopDeploymentPolicy {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.name !== 'string' || value.name.trim() === '') {
    throw new Error('desktop policy: invalid schema')
  }
  const allowedDomains = domains(value.allowedDomains)
  const npmRegistryUrl = value.npmRegistryUrl === undefined
    ? OFFICIAL_DESKTOP_NPM_REGISTRY
    : httpsUrl(value.npmRegistryUrl, 'npmRegistryUrl', allowedDomains)
  const preinstalledBundles = value.preinstalledBundles === undefined ? [] : value.preinstalledBundles
  if (!Array.isArray(preinstalledBundles) || !preinstalledBundles.every(packageSpec)) {
    throw new Error('desktop policy: preinstalledBundles must contain package names or exact package specs')
  }
  const allowedBuildsValue = value.allowedBuilds === undefined ? {} : value.allowedBuilds
  if (!record(allowedBuildsValue) || !Object.values(allowedBuildsValue).every(flag => typeof flag === 'boolean')) {
    throw new Error('desktop policy: allowedBuilds must contain boolean values')
  }
  const allowedBuilds = Object.fromEntries(
    Object.entries(allowedBuildsValue).map(([name, flag]) => [name, flag as boolean]),
  )
  const result: DesktopDeploymentPolicy = {
    schemaVersion: 1,
    name: value.name,
    npmRegistryUrl,
    preinstalledBundles: [...new Set(preinstalledBundles)].sort(),
    allowedBuilds: { ...allowedBuilds },
  }
  if (value.updateBaseUrl !== undefined) (result as { updateBaseUrl?: string }).updateBaseUrl = httpsUrl(value.updateBaseUrl, 'updateBaseUrl', allowedDomains)
  if (value.privateMarketUrl !== undefined) (result as { privateMarketUrl?: string }).privateMarketUrl = httpsUrl(value.privateMarketUrl, 'privateMarketUrl', allowedDomains)
  if (value.pipIndexUrl !== undefined) (result as { pipIndexUrl?: string }).pipIndexUrl = httpsUrl(value.pipIndexUrl, 'pipIndexUrl', allowedDomains)
  if (value.defaultProfile !== undefined) {
    if (typeof value.defaultProfile !== 'string' || value.defaultProfile.trim() === '') {
      throw new Error('desktop policy: defaultProfile must be a non-empty string')
    }
    ;(result as { defaultProfile?: string }).defaultProfile = value.defaultProfile
  }
  if (allowedDomains !== undefined) (result as { allowedDomains?: readonly string[] }).allowedDomains = allowedDomains
  return result
}

export function readDesktopDeploymentPolicyFile(path: string): DesktopDeploymentPolicy {
  if (!existsSync(path)) throw new Error(`desktop policy: file does not exist: ${path}`)
  try {
    return parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('desktop policy:')) throw error
    throw new Error(`desktop policy: invalid JSON file ${path}`, { cause: error })
  }
}

export function resolveDesktopDeploymentPolicy(env: NodeJS.ProcessEnv = process.env): DesktopDeploymentPolicy {
  const path = env[DSH_DESKTOP_DEPLOYMENT_POLICY_FILE]?.trim()
  if (path === undefined || path === '') {
    return {
      schemaVersion: 1,
      name: 'official',
      npmRegistryUrl: OFFICIAL_DESKTOP_NPM_REGISTRY,
      preinstalledBundles: [],
      allowedBuilds: {},
    }
  }
  return readDesktopDeploymentPolicyFile(path)
}

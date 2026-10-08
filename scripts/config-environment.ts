/** Read the selected deployment configuration without forwarding unrelated namespaces. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Private market settings consumed by the current DSH build. */
export interface PrivateMarketEnvironment {
  readonly environment: string
  readonly catalogUrl: string
  readonly catalogCredentialRef?: string
  readonly registryUrl: string
  readonly digest: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function httpsUrl(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`config-env: ${field} must be an HTTPS URL`)
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error(`config-env: ${field} must be an HTTPS URL`) }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error(`config-env: ${field} must be an HTTPS URL without credentials, query, or fragment`)
  }
  return url.href
}

/**
 * Read and validate `<configRoot>/<environment>/config.json`.
 * @param configRoot Directory containing named deployment environments.
 * @param environment Selected single path segment.
 * @returns Validated private market settings and their non-secret digest.
 * @throws Error when the selector, JSON document, schema, or private market fields are invalid.
 */
export function readPrivateMarketEnvironment(
  configRoot: string | undefined,
  environment: string,
): PrivateMarketEnvironment {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(environment)) {
    throw new Error(`config-env: invalid environment name ${JSON.stringify(environment)}`)
  }
  if (configRoot === undefined || configRoot === '') {
    throw new Error('config-env: set DSH_CONFIG_ENV_DIR to read a named environment')
  }
  let document: unknown
  try { document = JSON.parse(readFileSync(join(configRoot, environment, 'config.json'), 'utf8')) }
  catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(`config-env: cannot read ${environment}/config.json: ${cause}`, { cause: error })
  }
  if (!record(document) || document.schemaVersion !== 1 || document.environment !== environment) {
    throw new Error(`config-env: ${environment}/config.json must use schemaVersion 1 and match its environment name`)
  }
  for (const [name, value] of Object.entries(document)) {
    if (name !== 'schemaVersion' && name !== 'environment' && !record(value)) {
      throw new Error(`config-env: product namespace ${name} must be an object`)
    }
  }
  if (!record(document.plugins) || !record(document.plugins.privateMarket)) {
    throw new Error('config-env: plugins.privateMarket is required')
  }
  for (const [name, value] of Object.entries(document.plugins)) {
    if (name !== 'privateMarket' && !record(value)) {
      throw new Error(`config-env: plugin namespace ${name} must be an object`)
    }
  }
  const market = document.plugins.privateMarket
  const allowed = new Set(['catalogUrl', 'catalogCredentialRef', 'registryUrl'])
  const unknown = Object.keys(market).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`config-env: unsupported plugins.privateMarket field ${unknown}`)
  const catalogUrl = httpsUrl(market.catalogUrl, 'plugins.privateMarket.catalogUrl')
  const registryUrl = httpsUrl(market.registryUrl, 'plugins.privateMarket.registryUrl')
  const credential = market.catalogCredentialRef
  if (credential !== undefined && (typeof credential !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(credential))) {
    throw new Error('config-env: plugins.privateMarket.catalogCredentialRef must be a POSIX shell identifier')
  }
  const normalized = {
    catalogUrl,
    ...(credential === undefined ? {} : { catalogCredentialRef: credential }),
    registryUrl,
  }
  return {
    environment,
    ...normalized,
    digest: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  }
}

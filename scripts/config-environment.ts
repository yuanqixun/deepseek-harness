/** Read the selected deployment configuration without forwarding unrelated namespaces. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Private market settings consumed by the current DSH build. */
export interface PrivateMarketEnvironment {
  readonly environment: string
  readonly catalogUrl: string
  readonly tenantId?: string
  readonly catalogCredentialRef?: string
  readonly registryUrl: string
  readonly digest: string
}

/** Non-secret Desktop settings copied into the packaged application's metadata. */
export interface DesktopRuntimeEnvironment {
  readonly authProvider: 'deepseek-official' | 'dsh-pro-auth'
  readonly dshProAuth?: {
    readonly aicodeApiOrigin: string
    readonly autoLlmKeyEnabled: boolean
    readonly llmKeyEnvironment: string
    readonly modelApiKeyEnv: string
  }
  readonly llmPiAiProviders?: Record<string, unknown>
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function httpUrl(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`config-env: ${field} must be an HTTP or HTTPS URL`)
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error(`config-env: ${field} must be an HTTP or HTTPS URL`) }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error(`config-env: ${field} must use HTTP or HTTPS without credentials, query, or fragment`)
  }
  return url.href
}

function readEnvironmentDocument(configRoot: string | undefined, environment: string): Record<string, unknown> {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(environment)) {
    throw new Error(`config-env: invalid environment name ${JSON.stringify(environment)}`)
  }
  if (configRoot === undefined || configRoot === '') {
    throw new Error('config-env: set DSH_CONFIG_ENV_DIR to read a named environment')
  }
  let value: unknown
  try { value = JSON.parse(readFileSync(join(configRoot, environment, 'config.json'), 'utf8')) }
  catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(`config-env: cannot read ${environment}/config.json: ${cause}`, { cause: error })
  }
  if (!record(value) || value.schemaVersion !== 1 || value.environment !== environment) {
    throw new Error(`config-env: ${environment}/config.json must use schemaVersion 1 and match its environment name`)
  }
  for (const [name, item] of Object.entries(value)) {
    if (name !== 'schemaVersion' && name !== 'environment' && !record(item)) {
      throw new Error(`config-env: product namespace ${name} must be an object`)
    }
  }
  if (value.plugins !== undefined) {
    if (!record(value.plugins)) throw new Error('config-env: plugins must be an object')
    for (const [name, item] of Object.entries(value.plugins)) {
      if (!record(item)) throw new Error(`config-env: plugin namespace ${name} must be an object`)
    }
  }
  return value
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
  const document = readEnvironmentDocument(configRoot, environment)
  if (!record(document.plugins) || !record(document.plugins.privateMarket)) {
    throw new Error('config-env: plugins.privateMarket is required')
  }
  const market = document.plugins.privateMarket
  const allowed = new Set(['catalogUrl', 'tenantId', 'catalogCredentialRef', 'registryUrl'])
  const unknown = Object.keys(market).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`config-env: unsupported plugins.privateMarket field ${unknown}`)
  const catalogUrl = httpUrl(market.catalogUrl, 'plugins.privateMarket.catalogUrl')
  const registryUrl = httpUrl(market.registryUrl, 'plugins.privateMarket.registryUrl')
  const tenantId = market.tenantId
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !/^[1-9][0-9]*$/u.test(tenantId))) {
    throw new Error('config-env: plugins.privateMarket.tenantId must be a positive integer string')
  }
  const credential = market.catalogCredentialRef
  if (credential !== undefined && (typeof credential !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(credential))) {
    throw new Error('config-env: plugins.privateMarket.catalogCredentialRef must be a POSIX shell identifier')
  }
  const normalized = {
    catalogUrl,
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(credential === undefined ? {} : { catalogCredentialRef: credential }),
    registryUrl,
  }
  return {
    environment,
    ...normalized,
    digest: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  }
}

/**
 * Read the Desktop sign-in and model route settings from one named environment.
 * @param configRoot Directory containing named deployment environments.
 * @param environment Selected single path segment.
 * @returns Validated non-secret settings for the packaged Host and welcome page.
 * @throws Error when selected sign-in, Aicode, or provider settings are invalid.
 */
export function readDesktopRuntimeEnvironment(
  configRoot: string | undefined,
  environment: string,
): DesktopRuntimeEnvironment {
  const document = readEnvironmentDocument(configRoot, environment)
  const desktop = record(document.desktop) ? document.desktop : {}
  const authProvider = desktop.authProvider ?? 'deepseek-official'
  if (authProvider !== 'deepseek-official' && authProvider !== 'dsh-pro-auth') {
    throw new Error('config-env: desktop.authProvider must be deepseek-official or dsh-pro-auth')
  }
  const plugins = record(document.plugins) ? document.plugins : {}
  const rawProAuth = plugins['dsh-pro-auth']
  if (rawProAuth !== undefined && !record(rawProAuth)) {
    throw new Error('config-env: plugins.dsh-pro-auth must be an object')
  }
  const proAuth = rawProAuth === undefined ? undefined : readProAuthConfig(rawProAuth, environment)
  if (authProvider === 'dsh-pro-auth' && proAuth === undefined) {
    throw new Error('config-env: desktop.authProvider dsh-pro-auth requires plugins.dsh-pro-auth')
  }
  const llmPiAi = record(document['llm-pi-ai']) ? document['llm-pi-ai'] : undefined
  const providers = llmPiAi?.providers
  if (providers !== undefined && !record(providers)) throw new Error('config-env: llm-pi-ai.providers must be an object')
  if (record(providers)) {
    for (const [provider, value] of Object.entries(providers)) {
      if (!record(value)) throw new Error(`config-env: llm-pi-ai.providers.${provider} must be an object`)
      if ('apiKey' in value) throw new Error(`config-env: llm-pi-ai.providers.${provider}.apiKey cannot contain a credential value`)
    }
  }
  if (proAuth?.autoLlmKeyEnabled) {
    if (!record(providers) || !Object.values(providers).some(value => record(value) && value.apiKeyEnv === proAuth.modelApiKeyEnv)) {
      throw new Error('config-env: automatic Aicode Key requires an llm-pi-ai provider using modelApiKeyEnv')
    }
  }
  return {
    authProvider,
    ...(proAuth === undefined ? {} : { dshProAuth: proAuth }),
    ...(record(providers) ? { llmPiAiProviders: providers } : {}),
  }
}

function readProAuthConfig(value: Record<string, unknown>, environment: string): NonNullable<DesktopRuntimeEnvironment['dshProAuth']> {
  const allowed = new Set(['aicodeApiOrigin', 'autoLlmKeyEnabled', 'llmKeyEnvironment', 'modelApiKeyEnv'])
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`config-env: unsupported plugins.dsh-pro-auth field ${unknown}`)
  const aicodeApiOrigin = value.aicodeApiOrigin
  const autoLlmKeyEnabled = value.autoLlmKeyEnabled
  const llmKeyEnvironment = value.llmKeyEnvironment
  const modelApiKeyEnv = value.modelApiKeyEnv
  if (typeof aicodeApiOrigin !== 'string' || typeof autoLlmKeyEnabled !== 'boolean'
    || typeof llmKeyEnvironment !== 'string' || typeof modelApiKeyEnv !== 'string') {
    throw new Error('config-env: plugins.dsh-pro-auth requires aicodeApiOrigin, autoLlmKeyEnabled, llmKeyEnvironment, and modelApiKeyEnv')
  }
  const origin = aicodeApiOrigin === '' ? undefined : new URL(aicodeApiOrigin)
  const loopbackHttp = origin?.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  const secureHttps = origin?.protocol === 'https:' && origin.hostname !== ''
  if (origin !== undefined && (!loopbackHttp && !secureHttps || origin.username !== '' || origin.password !== ''
    || origin.pathname !== '/' || origin.search !== '' || origin.hash !== '')) {
    throw new Error('config-env: plugins.dsh-pro-auth.aicodeApiOrigin must be an HTTPS origin or loopback HTTP origin')
  }
  if (autoLlmKeyEnabled && (origin === undefined || !/^[a-z][a-z0-9-]*$/u.test(llmKeyEnvironment)
    || llmKeyEnvironment !== environment || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(modelApiKeyEnv))) {
    throw new Error('config-env: automatic Aicode Key requires a matching llmKeyEnvironment and a credential reference')
  }
  return { aicodeApiOrigin: origin?.origin ?? '', autoLlmKeyEnabled, llmKeyEnvironment, modelApiKeyEnv }
}

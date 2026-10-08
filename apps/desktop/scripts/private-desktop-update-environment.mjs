import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function origin(value, field) {
  let url
  try { url = new URL(value) } catch { throw new Error(`desktop updates: ${field} must be an HTTPS URL`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`desktop updates: ${field} must use HTTPS without credentials, query, or fragment`)
  }
  return url
}

/** Validate selected public settings without exposing other environment data.
 * @param {unknown} value Parsed `desktop.updates` object.
 * @param {string} environment Selected distribution name.
 * @returns {{ environment: string, checkUrl: string, channel: string, feedOrigins: string[] }} Normalized public settings.
 */
export function resolvePrivateDesktopUpdates(value, environment) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(environment)) throw new Error('desktop updates: invalid environment name')
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !Array.isArray(value.feedOrigins) || value.feedOrigins.length === 0) {
    throw new Error('desktop updates: configure checkUrl, channel, and nonempty feedOrigins')
  }
  const checkUrl = origin(value.checkUrl, 'checkUrl')
  if (checkUrl.pathname !== '/v1/desktop/updates/check' || checkUrl.search || checkUrl.hash) {
    throw new Error('desktop updates: checkUrl must use /v1/desktop/updates/check without query or fragment')
  }
  if (typeof value.channel !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(value.channel)) {
    throw new Error('desktop updates: channel must be a lowercase identifier')
  }
  const unknown = Object.keys(value).find(key => !['checkUrl', 'channel', 'feedOrigins'].includes(key))
  if (unknown !== undefined) throw new Error(`desktop updates: unsupported field ${unknown}`)
  const feedOrigins = value.feedOrigins.map(item => {
    const url = origin(item, 'feedOrigins')
    if (url.pathname !== '/' || url.search || url.hash) throw new Error('desktop updates: feedOrigins entries must be HTTPS origins')
    return url.origin
  })
  return { environment, checkUrl: checkUrl.href, channel: value.channel, feedOrigins: [...new Set(feedOrigins)] }
}

/** Read only `desktop.updates` from the chosen named environment.
 * @param {string | undefined} configRoot Directory containing named environments.
 * @param {string} environment Selected distribution name.
 * @returns {{ environment: string, checkUrl: string, channel: string, feedOrigins: string[] }} Normalized public settings.
 */
export function readPrivateDesktopUpdates(configRoot, environment) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(environment)) throw new Error('desktop updates: invalid environment name')
  if (configRoot === undefined || configRoot === '') throw new Error('desktop updates: set DSH_CONFIG_ENV_DIR')
  let document
  try { document = JSON.parse(readFileSync(join(configRoot, environment, 'config.json'), 'utf8')) }
  catch (error) { throw new Error(`desktop updates: cannot read ${environment}/config.json`, { cause: error }) }
  if (typeof document !== 'object' || document === null || Array.isArray(document)
    || document.schemaVersion !== 1 || document.environment !== environment) {
    throw new Error(`desktop updates: ${environment}/config.json must match schemaVersion 1 and its environment name`)
  }
  if (typeof document.desktop !== 'object' || document.desktop === null || Array.isArray(document.desktop)
    || typeof document.desktop.updates !== 'object' || document.desktop.updates === null || Array.isArray(document.desktop.updates)) {
    throw new Error('desktop updates: configure desktop.updates')
  }
  return resolvePrivateDesktopUpdates(document.desktop.updates, environment)
}

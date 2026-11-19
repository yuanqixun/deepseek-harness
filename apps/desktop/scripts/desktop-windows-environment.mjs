import { win32 } from 'node:path'

const APP_ID = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u
const WINDOWS_INVALID_COMPONENT = /[<>:"|?*%$!\x00-\x1f]/u
const DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu

/**
 * Resolve and validate the Windows installation and storage settings from one environment document.
 * @param {unknown} value The selected environment's `desktop.windows` value.
 * @returns {{ appId: string, installDirectory: string, dshHome: string, userDataDirectory: string }} Normalized Windows settings.
 */
export function resolveDesktopWindowsEnvironment(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('desktop Windows environment: desktop.windows must be an object')
  }
  const allowed = new Set(['appId', 'installDirectory', 'dshHome', 'userDataDirectory'])
  const unknown = Object.keys(value).find(key => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`desktop Windows environment: unsupported field desktop.windows.${unknown}`)
  for (const field of allowed) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      throw new Error(`desktop Windows environment: desktop.windows.${field} must be a nonempty string`)
    }
  }
  if (!APP_ID.test(value.appId)) throw new Error('desktop Windows environment: desktop.windows.appId must be a reverse-DNS identifier')
  const installDirectory = absoluteDirectory(value.installDirectory, 'installDirectory')
  const dshHome = tokenDirectory(value.dshHome, '%USERPROFILE%', 'dshHome')
  const userDataDirectory = tokenDirectory(value.userDataDirectory, '%APPDATA%', 'userDataDirectory')
  if (overlaps(dshHome, userDataDirectory)) {
    throw new Error('desktop Windows environment: desktop.windows.dshHome and userDataDirectory must be separate directories')
  }
  for (const [field, path] of [['dshHome', dshHome], ['userDataDirectory', userDataDirectory]]) {
    if (overlaps(installDirectory, path)) {
      throw new Error(`desktop Windows environment: desktop.windows.${field} must be outside installDirectory`)
    }
  }
  return { appId: value.appId, installDirectory, dshHome, userDataDirectory }
}

/**
 * Read the selected Windows installation settings from a validated environment document.
 * @param {Record<string, unknown>} document The selected environment document.
 * @returns {{ appId: string, installDirectory: string, dshHome: string, userDataDirectory: string }} Normalized Windows settings.
 */
export function readDesktopWindowsEnvironment(document) {
  const desktop = document.desktop
  if (desktop !== undefined && (typeof desktop !== 'object' || desktop === null || Array.isArray(desktop))) {
    throw new Error('desktop Windows environment: desktop must be an object')
  }
  return resolveDesktopWindowsEnvironment(desktop?.windows)
}

function absoluteDirectory(value, field) {
  if (value !== value.trim() || value.includes('/') || !/^[A-Za-z]:\\/u.test(value) || !win32.isAbsolute(value)) {
    throw new Error(`desktop Windows environment: desktop.windows.${field} must be an absolute drive path`)
  }
  const normalized = win32.normalize(value)
  if (normalized !== value || normalized.length <= 3 || normalized.length > 180) {
    throw new Error(`desktop Windows environment: desktop.windows.${field} must be normalized, at most 180 characters, and cannot be a drive root`)
  }
  validateComponents(value.slice(3), field)
  return normalized
}

function tokenDirectory(value, token, field) {
  const prefix = `${token}\\`
  if (value !== value.trim() || !value.startsWith(prefix) || value.includes('/') || value.includes('%', token.length)) {
    throw new Error(`desktop Windows environment: desktop.windows.${field} must start with ${token} and contain no other environment tokens`)
  }
  const suffix = value.slice(prefix.length)
  if (suffix === '' || win32.normalize(suffix) !== suffix || suffix.startsWith('\\')) {
    throw new Error(`desktop Windows environment: desktop.windows.${field} must be a normalized directory below ${token}`)
  }
  validateComponents(suffix, field)
  return value
}

function validateComponents(value, field) {
  for (const component of value.split('\\')) {
    if (component === '' || component === '.' || component === '..' || component.endsWith('.') || component.endsWith(' ')
      || WINDOWS_INVALID_COMPONENT.test(component) || DEVICE_NAME.test(component)) {
      throw new Error(`desktop Windows environment: desktop.windows.${field} contains an invalid path component`)
    }
  }
}

function overlaps(left, right) {
  const normalize = path => win32.resolve(path.replace('%USERPROFILE%', 'C:\\Users\\desktop-user')
    .replace('%APPDATA%', 'C:\\Users\\desktop-user\\AppData\\Roaming')).toLowerCase()
  const a = normalize(left)
  const b = normalize(right)
  return a === b || a.startsWith(`${b}\\`) || b.startsWith(`${a}\\`)
}

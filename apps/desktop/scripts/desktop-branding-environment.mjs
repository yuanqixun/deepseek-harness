import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const DESKTOP_BRANDING_ENV = 'DSH_DESKTOP_BRANDING'
export const DEFAULT_DESKTOP_DISPLAY_NAME = 'DeepSeek Harness'
export const DEFAULT_DESKTOP_ARTIFACT_NAME_BASE = 'deepseek-harness'
export const DEFAULT_DESKTOP_ICON_SET = 'dsh'

const ICON_FILES = ['icon-windows.png', 'icon-macos.png', 'tray-windows.ico',
  'sidebar-mark.svg',
  'installer/brand.png', 'installer/brand-2x.png', 'installer/brand-dark.png',
  'installer/brand-dark-2x.png', 'installer/uninstaller-sidebar.png']

function nonempty(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || value.trim() !== value || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error(`desktop branding: ${field} must be a nonempty string without control characters`)
  }
  return value
}

function validateFileBase(value) {
  if (value === '' || value === '.' || value === '..' || /[\\/:*?"<>|\x00-\x1f]/u.test(value)) {
    throw new Error('desktop branding: artifactNameBase must be a single safe filename component')
  }
  return value
}

export function resolveDesktopBranding(value = undefined) {
  if (value === undefined || value === null) value = {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('desktop branding: desktop.branding must be an object')
  const unknown = Object.keys(value).find(key => !['displayName', 'iconSet', 'artifactNameBase'].includes(key))
  if (unknown !== undefined) throw new Error(`desktop branding: unsupported field ${unknown}`)
  const displayName = nonempty(value.displayName, DEFAULT_DESKTOP_DISPLAY_NAME, 'displayName')
  if (/[\\/:*?"<>|]/u.test(displayName)) throw new Error('desktop branding: displayName cannot contain filename separators or reserved characters')
  const iconSet = nonempty(value.iconSet, DEFAULT_DESKTOP_ICON_SET, 'iconSet')
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(iconSet)) throw new Error('desktop branding: iconSet must be a lowercase identifier')
  const artifactNameBase = validateFileBase(nonempty(value.artifactNameBase,
    value.displayName === undefined || value.displayName === null || value.displayName === ''
      ? DEFAULT_DESKTOP_ARTIFACT_NAME_BASE : displayName, 'artifactNameBase'))
  return { displayName, iconSet, artifactNameBase }
}

export function readDesktopBranding(configRoot, environment) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(environment)) throw new Error('desktop branding: invalid environment name')
  if (configRoot === undefined || configRoot === '') throw new Error('desktop branding: set DSH_CONFIG_ENV_DIR')
  let document
  try { document = JSON.parse(readFileSync(join(configRoot, environment, 'config.json'), 'utf8')) }
  catch (error) { throw new Error(`desktop branding: cannot read ${environment}/config.json`, { cause: error }) }
  if (typeof document !== 'object' || document === null || Array.isArray(document)
    || document.schemaVersion !== 1 || document.environment !== environment) {
    throw new Error(`desktop branding: ${environment}/config.json must match schemaVersion 1 and its environment name`)
  }
  const desktop = document.desktop
  if (desktop !== undefined && (typeof desktop !== 'object' || desktop === null || Array.isArray(desktop))) {
    throw new Error('desktop branding: desktop must be an object')
  }
  return resolveDesktopBranding(desktop?.branding)
}

export function resolveDesktopIconSet(root, iconSet = DEFAULT_DESKTOP_ICON_SET) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(iconSet)) throw new Error('desktop branding: invalid iconSet')
  const directory = join(root, iconSet)
  const missing = ICON_FILES.find(file => {
    try {
      const path = join(directory, file)
      return !statSync(path).isFile() || readFileSync(path).length === 0
    }
    catch { return true }
  })
  if (missing !== undefined) throw new Error(`desktop branding: icon set ${iconSet} is missing or unreadable ${missing}`)
  return Object.fromEntries(ICON_FILES.map(file => [file, join(directory, file)]))
}

export function desktopBrandingFromEnvironment(environment = process.env) {
  if (environment[DESKTOP_BRANDING_ENV] === undefined) return resolveDesktopBranding()
  let value
  try { value = JSON.parse(environment[DESKTOP_BRANDING_ENV]) }
  catch (error) { throw new Error('desktop branding: invalid DSH_DESKTOP_BRANDING JSON', { cause: error }) }
  return resolveDesktopBranding(value)
}

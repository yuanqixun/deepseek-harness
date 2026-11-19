import { win32 } from 'node:path'

const INVALID_COMPONENT = /[<>:"|?*%$!\x00-\x1f]/u
const DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu

/** Absolute Harness and Electron data paths for a packaged Windows environment. */
export interface DesktopWindowsDataPaths {
  readonly dshHome: string
  readonly userDataDirectory: string
}

/**
 * Expand the supported Windows profile tokens in packaged data paths.
 * @param value Packaged Windows environment metadata.
 * @param environment Process environment containing the Windows profile directories.
 * @returns Absolute paths for Harness data and Electron user data.
 */
export function resolveDesktopWindowsDataPaths(
  value: unknown,
  environment: NodeJS.ProcessEnv = process.env,
): DesktopWindowsDataPaths {
  if (!isRecord(value)) throw new Error('desktop startup: invalid packaged Windows environment settings')
  const dshHome = expandDataDirectory(value.dshHome, '%USERPROFILE%', environment.USERPROFILE, 'dshHome')
  const userDataDirectory = expandDataDirectory(value.userDataDirectory, '%APPDATA%', environment.APPDATA, 'userDataDirectory')
  const effectiveDshHome = environment.DSH_HOME?.trim()
    ? win32.resolve(environment.DSH_HOME)
    : dshHome
  const localAppData = environment.LOCALAPPDATA
  if (localAppData !== undefined && (localAppData.includes('%') || !win32.isAbsolute(localAppData)
    || !/^[A-Za-z]:\\/u.test(localAppData) && !/^\\\\[^\\]+\\[^\\]+(?:\\.*)?$/u.test(localAppData))) {
    throw new Error('desktop startup: Windows LOCALAPPDATA is not a fully qualified path')
  }
  const pythonRuntime = localAppData === undefined
    ? undefined
    : win32.resolve(localAppData, 'DeepSeek Harness', 'Python', '3.14.10')
  if (overlaps(dshHome, userDataDirectory) || overlaps(effectiveDshHome, userDataDirectory)
    || pythonRuntime !== undefined && (overlaps(effectiveDshHome, pythonRuntime) || overlaps(userDataDirectory, pythonRuntime))) {
    throw new Error('desktop startup: Windows Harness, Electron user-data, and shared Python runtime directories must be separate')
  }
  return { dshHome, userDataDirectory }
}

function expandDataDirectory(value: unknown, token: string, root: string | undefined, field: string): string {
  if (typeof value !== 'string' || !value.startsWith(`${token}\\`) || value.includes('%', token.length)) {
    throw new Error(`desktop startup: invalid Windows ${field} setting`)
  }
  if (root === undefined || root !== root.trim() || root.includes('%') || !win32.isAbsolute(root)
    || !/^[A-Za-z]:\\/u.test(root) && !/^\\\\[^\\]+\\[^\\]+(?:\\.*)?$/u.test(root)) {
    throw new Error(`desktop startup: Windows ${token} is unavailable for ${field}`)
  }
  const relative = value.slice(token.length + 1)
  const segments = relative.split('\\')
  if (relative === '' || win32.normalize(relative) !== relative || segments.some(segment => segment === '' || segment === '.' || segment === '..'
    || segment.endsWith('.') || segment.endsWith(' ') || INVALID_COMPONENT.test(segment) || DEVICE_NAME.test(segment))) {
    throw new Error(`desktop startup: invalid relative path in Windows ${field} setting`)
  }
  const path = win32.resolve(root, relative)
  const normalizedRoot = win32.resolve(root)
  const relativePath = win32.relative(normalizedRoot, path)
  if (!win32.isAbsolute(path) || relativePath === '' || relativePath === '..'
    || relativePath.startsWith(`..${win32.sep}`) || win32.isAbsolute(relativePath)) {
    throw new Error(`desktop startup: Windows ${field} must stay below ${token}`)
  }
  return path
}

function overlaps(left: string, right: string): boolean {
  const a = win32.resolve(left).toLowerCase()
  const b = win32.resolve(right).toLowerCase()
  return a === b || a.startsWith(`${b}\\`) || b.startsWith(`${a}\\`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

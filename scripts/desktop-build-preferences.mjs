/** Keep confirmed Desktop build selections in the current user's config directory. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Path for non-secret Desktop build selections on this host. */
function preferencesPath() {
  const root = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return process.platform === 'win32'
    ? join(root, 'DeepSeekHarness', 'desktop-build-preferences.json')
    : join(root, 'deepseek-harness', 'desktop-build-preferences.json')
}

/**
 * Read the last confirmed build version and configuration environment.
 * @param target - Native build target key.
 * @returns The saved selections, or empty values before the first confirmation; rejects when the file is unreadable or invalid.
 */
export async function readDesktopBuildPreferences(target) {
  const path = preferencesPath()
  let contents
  try {
    contents = await readFile(path, 'utf8')
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { buildVersion: '', configEnvironment: '' }
    }
    throw error
  }
  const document = JSON.parse(contents)
  if (document === null || typeof document !== 'object' || document.schemaVersion !== 1
    || document.targets === null || typeof document.targets !== 'object') {
    throw new Error(`desktop build preferences: invalid file at ${path}; remove it to start with empty defaults`)
  }
  const saved = document.targets[target]
  if (saved === undefined) return { buildVersion: '', configEnvironment: '' }
  if (saved === null || typeof saved !== 'object'
    || typeof saved.buildVersion !== 'string' || typeof saved.configEnvironment !== 'string') {
    throw new Error(`desktop build preferences: invalid ${target} entry at ${path}; remove it to start with empty defaults`)
  }
  return { buildVersion: saved.buildVersion, configEnvironment: saved.configEnvironment }
}

/**
 * Persist selections after the user confirms a package run.
 * @param target - Native build target key.
 * @param buildVersion - Confirmed package version.
 * @param configEnvironment - Confirmed configuration environment, or empty to clear it.
 * @returns Resolves after atomically replacing the user's preferences file.
 * @throws When the saved file is invalid or the preferences cannot be written.
 */
export async function writeDesktopBuildPreferences(target, buildVersion, configEnvironment) {
  const path = preferencesPath()
  let document = { schemaVersion: 1, targets: {} }
  try {
    document = JSON.parse(await readFile(path, 'utf8'))
  }
  catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (document === null || typeof document !== 'object' || document.schemaVersion !== 1
    || document.targets === null || typeof document.targets !== 'object') {
    throw new Error(`desktop build preferences: invalid file at ${path}; remove it to start with empty defaults`)
  }
  document.targets[target] = { buildVersion, configEnvironment }
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporaryPath, path)
  }
  catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, target, buildVersion, configEnvironment] = process.argv.slice(2)
  if (operation === 'read' && target !== undefined && process.argv.length === 4) {
    process.stdout.write(`${JSON.stringify(await readDesktopBuildPreferences(target))}\n`)
  }
  else if (operation === 'write' && target !== undefined && buildVersion !== undefined
    && (process.argv.length === 5 || process.argv.length === 6)) {
    await writeDesktopBuildPreferences(target, buildVersion, configEnvironment ?? '')
  }
  else {
    process.stderr.write('usage: desktop-build-preferences.mjs read <target> | write <target> <version> [config-environment]\n')
    process.exitCode = 2
  }
}

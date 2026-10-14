/** Validate the assembled application, including native Office conversion outside ASAR. */
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { desktopTargetInternalArtifactsDirectory, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { resolveDesktopBuildVersion } from './desktop-build-version.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'
import { desktopBrandingFromEnvironment } from './desktop-branding-environment.mjs'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false }, 'internal-dmg': { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const buildVersion = resolveDesktopBuildVersion(process.env,
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
const internalArtifacts = desktopTargetInternalArtifactsDirectory(target, buildVersion)
if (values.unsigned && !['win-x64', 'mac-arm64', 'mac-x64'].includes(target)) {
  throw new Error('desktop smoke: unsigned artifacts require a supported release target')
}
if (values['internal-dmg'] && (windows || values.unsigned)) throw new Error('desktop smoke: internal disk images require macOS')
const artifacts = values.unsigned ? windows ? internalArtifacts : paths.unsignedArtifacts
  : values['internal-dmg'] ? internalArtifacts
    : paths.artifacts
const displayName = desktopBrandingFromEnvironment(process.env).displayName
const application = windows ? join(artifacts, 'win-unpacked')
  : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', `${displayName}.app`, 'Contents')
const resources = join(application, windows ? 'resources' : 'Resources')
const executable = windows ? join(application, `${displayName}.exe`) : join(application, 'MacOS', displayName)
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)

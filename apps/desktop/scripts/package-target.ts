/** Build one release target with matching Electron and dsh architecture. */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { join, resolve } from 'node:path'
import {
  desktopBuildRecordFilename,
  resolveDesktopAutoUpdateConfig,
} from './desktop-auto-update-environment.mjs'
import {
  desktopReleasesRoot,
  desktopTargetBuildPaths,
  desktopTargetInternalArtifactsDirectory,
  desktopTargetReleaseArtifactsDirectory,
} from './desktop-build-paths.mjs'
import { packageMacOSArtifacts, type DesktopPrepackagedArtifact } from './package-macos.ts'
import { loadDesktopPackageEnvironment, localMacOSPackageEnvironment, validateDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createPackagingRun, recordPackagingEvent } from './packaging-run.mjs'
import { withWindowsSigningStage } from './windows-signing-stage.mjs'
import { prepareWindowsSignatureCacheDirectory, resolveWindowsSignatureCacheDirectory } from './windows-signature-cache-directory.mjs'
import { withMacOSSigningKeychain } from './macos-signing-keychain.mjs'
import { macOSDownloadEnvironment, resolveMacOSPackageSettings } from './macos-package-settings.mjs'
import { packagingErrorDetails, packagingStep } from './packaging-step.mjs'
import { notarizeMacOS } from './notarize-macos.mjs'
import { resolveMacOSNotarizationEnvironment } from './desktop-release-environment.mjs'
import { DESKTOP_BUILD_VERSION_ENV, resolveDesktopBuildVersion, validateDesktopBuildVersion } from './desktop-build-version.mjs'
import { suggestDesktopBuildVersion } from './desktop-build-version-discovery.ts'
import { desktopBuildCommitEnvironment, readDesktopBuildCommit, resolveDesktopBuildCommit } from './desktop-build-commit.mjs'
import { requireDesktopToolchain } from './desktop-toolchain-preflight.ts'
import { withMacOSNotarizationProxy } from './macos-notarization-proxy.ts'
import { packagePrivateMarket, resolvePrivateMarketSource, resolveProAuthSource } from './private-market-package.ts'
import { readPrivateMarketEnvironment } from '../../../scripts/config-environment.ts'
import { readPrivateDesktopUpdates } from './private-desktop-update-environment.mjs'
import { verifyPrivateDesktopUpdateArtifacts } from './private-desktop-update-artifacts.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const WINDOWS_SIGNING_ENV_PREFIX = 'DSH_DESKTOP_WINDOWS_'
const WINDOWS_SIGNING_ENV_NAMES = [
  'DSH_DESKTOP_WINDOWS_CER_FILE',
  'DSH_DESKTOP_WINDOWS_KEY_CONTAINER',
  'DSH_DESKTOP_WINDOWS_SIGNTOOL',
  'DSH_DESKTOP_WINDOWS_TOKEN_PIN',
  'DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_DIR',
  'DSH_DESKTOP_WINDOWS_SIGNATURE_CACHE_CONCURRENCY',
] as const
const DESKTOP_UPLOAD_CREDENTIAL_ENV_NAMES = new Set([
  'DOWNLOAD_TEST_COS_SECRET_ID',
  'DOWNLOAD_TEST_COS_SECRET_KEY',
  'DOWNLOAD_PROD_COS_SECRET_ID',
  'DOWNLOAD_PROD_COS_SECRET_KEY',
])

/** `--build-version` value that numbers a build after the ones already taken. */
const AUTOMATIC_BUILD_VERSION = 'auto'

/** Fixed platform and architecture identifiers exposed by package scripts. */
export type DesktopPackageTargetName = 'mac-arm64' | 'mac-x64' | 'win-x64'

/** One supported release target and its electron-builder selectors. */
export interface DesktopPackageTarget {
  readonly name: DesktopPackageTargetName
  readonly platform: 'darwin' | 'win32'
  readonly arch: 'arm64' | 'x64'
  readonly builderPlatform: '--mac' | '--win'
  readonly builderArch: '--arm64' | '--x64'
}

const TARGETS: Record<DesktopPackageTargetName, DesktopPackageTarget> = {
  'mac-arm64': {
    name: 'mac-arm64',
    platform: 'darwin',
    arch: 'arm64',
    builderPlatform: '--mac',
    builderArch: '--arm64',
  },
  'mac-x64': {
    name: 'mac-x64',
    platform: 'darwin',
    arch: 'x64',
    builderPlatform: '--mac',
    builderArch: '--x64',
  },
  'win-x64': {
    name: 'win-x64',
    platform: 'win32',
    arch: 'x64',
    builderPlatform: '--win',
    builderArch: '--x64',
  },
}

/**
 * Remove Windows signing configuration from package preparation subprocesses.
 * @param environment - Packaging command environment.
 * @returns A copy without Windows signing fields.
 */
export function withoutWindowsSigningEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !name.startsWith(WINDOWS_SIGNING_ENV_PREFIX)))
}

/**
 * Select signing mode and strip unsigned-build credentials for packaging subprocesses.
 * @param environment - Target packaging environment.
 * @param unsigned - Whether to create a local artifact without release signing or notarization.
 * @param internalDmg - Whether to create an internal macOS disk image without release signing.
 * @returns Packaging environment without release credential inputs for local builds.
 */
export function desktopElectronBuilderEnvironment(
  environment: NodeJS.ProcessEnv, unsigned: boolean, internalDmg = false,
): NodeJS.ProcessEnv {
  const selected: NodeJS.ProcessEnv = {
    ...environment,
    DSH_DESKTOP_UNSIGNED: unsigned ? '1' : '0',
    ...(internalDmg ? { DSH_DESKTOP_INTERNAL_DMG: '1' } : {}),
  }
  // The bundled NSIS decoder cannot extract 7-Zip's automatic ARM64-filtered entries.
  if (environment.DSH_DESKTOP_TARGET_PLATFORM === 'win32') selected.ELECTRON_BUILDER_7Z_FILTER = 'BCJ'
  if (!unsigned && !internalDmg) return selected
  return {
    ...Object.fromEntries(Object.entries(withoutWindowsSigningEnvironment(selected))
      .filter(([name]) => !/^(?:APPLE_|(?:WIN_)?CSC_)/iu.test(name)
        && (!name.startsWith('DSH_DESKTOP_MACOS_') || name === 'DSH_DESKTOP_MACOS_PACK_CONCURRENCY'))),
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    DSH_DESKTOP_UNSIGNED: unsigned ? '1' : '0',
    ...(internalDmg ? { DSH_DESKTOP_INTERNAL_DMG: '1' } : {}),
  }
}

/**
 * Remove upload-only COS credentials from every packaging subprocess.
 * @param environment - Packaging command environment.
 * @returns A copy without Desktop upload credentials.
 */
export function withoutDesktopUploadCredentials(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !DESKTOP_UPLOAD_CREDENTIAL_ENV_NAMES.has(name)))
}

function isTargetName(value: string): value is DesktopPackageTargetName {
  return Object.hasOwn(TARGETS, value)
}

/** Reject private update builds outside Windows x64 and macOS arm64.
 * @param target - Validated packaging target.
 * @returns `undefined` when the target can use the private update protocol.
 */
export function assertPrivateDesktopUpdateTarget(target: DesktopPackageTarget): void {
  if (target.name !== 'win-x64' && target.name !== 'mac-arm64') {
    throw new Error('desktop package: private desktop updates require win-x64 or mac-arm64')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function packageVersion(path: string, label: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`desktop package: ${label} has no version`)
  }
  return manifest.version
}

async function writeReleaseRecord(
  target: DesktopPackageTarget,
  environment: NodeJS.ProcessEnv,
  artifactsRoot: string,
  privateDesktopUpdates: boolean,
): Promise<void> {
  const desktopVersion = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const dshVersion = packageVersion(join(REPOSITORY_ROOT, 'package.json'), 'dsh package')
  if (desktopVersion !== dshVersion) {
    throw new Error(`desktop package: desktop version ${desktopVersion} does not match dsh version ${dshVersion}`)
  }
  const packaged = resolveDesktopBuildCommit(environment)
  const privateUpdates = environment.DSH_DESKTOP_PRIVATE_UPDATE_CONFIG === undefined
    ? undefined
    : JSON.parse(environment.DSH_DESKTOP_PRIVATE_UPDATE_CONFIG) as {
      environment: string
      distribution: string
      checkUrl: string
    }
  const update = privateUpdates === undefined ? resolveDesktopAutoUpdateConfig(environment, target.platform, target.arch) : undefined
  const buildVersion = resolveDesktopBuildVersion(environment, dshVersion)
  const updateArtifacts = privateDesktopUpdates
    ? await verifyPrivateDesktopUpdateArtifacts(artifactsRoot, target, buildVersion) : undefined
  const marketRecord = join(desktopTargetBuildPaths(target.name).packedDsh, 'private-market-build.json')
  const recordPath = join(artifactsRoot, desktopBuildRecordFilename(target.name))
  const temporaryPath = `${recordPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify({
    schemaVersion: 1,
    target: target.name,
    version: buildVersion,
    environment: update?.environment ?? privateUpdates?.environment,
    ...(update === undefined ? {} : { publicUrl: update.publicUrl }),
    ...(privateUpdates === undefined ? {} : {
      privateDesktopUpdates: {
        environment: privateUpdates.environment,
        distribution: privateUpdates.distribution,
        checkUrl: privateUpdates.checkUrl,
      },
    }),
    ...(updateArtifacts === undefined ? {} : updateArtifacts),
    ...(existsSync(marketRecord) ? { privateMarket: JSON.parse(readFileSync(marketRecord, 'utf8')) } : {}),
    // Upload reads this to tag the commit a production release was packaged from.
    ...packaged === undefined ? {} : { commit: packaged.commit, dirty: packaged.dirty },
  }, null, 2)}\n`)
  renameSync(temporaryPath, recordPath)
}

/**
 * Resolve a named release target and reject hosts that cannot execute its packaged runtime.
 * @param name - One of the fixed Desktop release target names.
 * @param hostPlatform - Build-host Node.js platform.
 * @param hostArch - Build-host Node.js architecture.
 * @returns The target selectors shared by runtime preparation and electron-builder.
 */
export function resolveDesktopPackageTarget(
  name: string,
  hostPlatform: NodeJS.Platform = process.platform,
  hostArch: string = process.arch,
): DesktopPackageTarget {
  if (!isTargetName(name)) {
    throw new Error(`desktop package: unsupported target ${JSON.stringify(name)}; expected ${Object.keys(TARGETS).join(', ')}`)
  }
  const target = TARGETS[name]
  if (target.platform === 'win32' && (hostPlatform !== 'win32' || hostArch !== 'x64')) {
    throw new Error('desktop package: win-x64 requires a Windows x64 build host')
  }
  if (target.platform === 'darwin' && hostPlatform !== 'darwin') {
    throw new Error(`desktop package: ${name} requires a macOS build host`)
  }
  if (name === 'mac-arm64' && hostArch !== 'arm64') {
    throw new Error('desktop package: mac-arm64 requires an Apple Silicon build host')
  }
  if (name === 'mac-x64' && hostArch !== 'arm64' && hostArch !== 'x64') {
    throw new Error('desktop package: mac-x64 requires an Intel Mac or Apple Silicon with Rosetta')
  }
  return target
}

interface DesktopPackageInvocation {
  readonly target: DesktopPackageTarget
  readonly directory: boolean
  readonly prepareOnly: boolean
  readonly unsigned: boolean
  readonly internalDmg: boolean
  readonly preinstallPrivatePlugins: boolean
  readonly check: boolean
  /** Named deployment environment whose private market or Desktop update settings are selected. */
  readonly configEnvironment: string | undefined
  /** Build identifier to publish under, when this build does not publish the product version. */
  readonly requestedBuildVersion: string | undefined
}

function hostTargetName(platform: NodeJS.Platform, arch: string): DesktopPackageTargetName {
  const name = `${platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform}-${arch}`
  if (!isTargetName(name)) throw new Error(`desktop package: unsupported build host ${platform}-${arch}`)
  return name
}

/**
 * Parse the fixed-target packaging command line.
 * @param argv - Arguments after the script entry point.
 * @param hostPlatform - Build-host Node.js platform.
 * @param hostArch - Build-host Node.js architecture.
 * @returns The validated target and whether to emit an unpacked directory.
 */
export function parseDesktopPackageInvocation(
  argv: readonly string[],
  hostPlatform: NodeJS.Platform = process.platform,
  hostArch: string = process.arch,
): DesktopPackageInvocation {
  const { values, positionals } = parseArgs({
    // `pnpm run <script> -- --build-version x` forwards the separator itself, and the script's own
    // preset arguments come first, so it can land anywhere; parseArgs would read the rest as targets.
    args: argv.filter(argument => argument !== '--'),
    allowPositionals: true,
    options: {
      dir: { type: 'boolean', default: false },
      'prepare-only': { type: 'boolean', default: false },
      unsigned: { type: 'boolean', default: false },
      'internal-dmg': { type: 'boolean', default: false },
      'preinstall-private-plugins': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      'build-version': { type: 'string' },
      'config-env': { type: 'string' },
    },
  })
  if (positionals.length > 1) throw new Error('desktop package: expected at most one target')
  const name = positionals[0] ?? hostTargetName(hostPlatform, hostArch)
  if (values.unsigned && values['prepare-only']) throw new Error('desktop package: --unsigned cannot use --prepare-only')
  if (values['internal-dmg'] && name !== 'mac-arm64') throw new Error('desktop package: --internal-dmg requires mac-arm64')
  if (values['internal-dmg'] && (values.unsigned || values['prepare-only'] || values.dir)) {
    throw new Error('desktop package: --internal-dmg cannot combine with --unsigned, --prepare-only, or --dir')
  }
  const requestedBuildVersion = values['build-version']?.trim()
  if (values['build-version'] !== undefined && (requestedBuildVersion === undefined || requestedBuildVersion === '')) {
    throw new Error('desktop package: --build-version requires a value')
  }
  return {
    target: resolveDesktopPackageTarget(name, hostPlatform, hostArch),
    directory: values.dir,
    prepareOnly: values['prepare-only'],
    unsigned: values.unsigned,
    internalDmg: values['internal-dmg'],
    preinstallPrivatePlugins: values['preinstall-private-plugins'],
    check: values.check,
    configEnvironment: values['config-env'],
    requestedBuildVersion,
  }
}

/**
 * Build the electron-builder command arguments for one validated target.
 * @param target - Supported release target.
 * @param directory - Whether to stop at an unpacked application directory.
 * @param artifact - Optional single artifact built from an existing signed application.
 * @returns Arguments that keep publishing under the separate validated upload command.
 */
export function desktopElectronBuilderArguments(
  target: DesktopPackageTarget,
  directory: boolean,
  artifact?: DesktopPrepackagedArtifact,
): readonly string[] {
  return [
    'exec',
    'electron-builder',
    '--config',
    'electron-builder.config.mjs',
    target.builderPlatform,
    ...(artifact === undefined ? [] : [artifact.format]),
    target.builderArch,
    '--publish',
    'never',
    ...(directory ? ['--dir'] : []),
    ...(artifact === undefined ? [] : [
      ...(target.platform === 'darwin' ? ['--config.mac.notarize=false'] : []),
      '--prepackaged', artifact.appPath,
      '--config.directories.output', artifact.output,
    ]),
  ]
}

function runPnpm(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = APP_ROOT,
  run?: ReturnType<typeof createPackagingRun>,
): Promise<void> {
  const pnpmEntry = process.env.npm_execpath
  if (pnpmEntry === undefined || pnpmEntry === '') {
    throw new Error('desktop package: invoke this script through a pnpm package command')
  }
  if (run !== undefined) return run.run(args.join(' '), process.execPath, [pnpmEntry, ...args], { cwd, env })
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [pnpmEntry, ...args], {
      cwd,
      env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop package: pnpm ${args.join(' ')} exited with ${String(code ?? signal)}`))
    })
  })
}

/**
 * Resolve the version one run publishes from what its command line asked for.
 * @param invocation - Validated packaging request.
 * @param productVersion - Version the manifests declare.
 * @param environment - Release settings, which name the bucket automatic numbering reads.
 * @returns The product version, the requested version, or the next free index for today.
 */
async function resolveRequestedBuildVersion(
  invocation: DesktopPackageInvocation,
  productVersion: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const requested = invocation.requestedBuildVersion
  if (requested === undefined) return productVersion
  if (requested !== AUTOMATIC_BUILD_VERSION) return validateDesktopBuildVersion(requested, productVersion)
  return suggestDesktopBuildVersion({
    productVersion, target: invocation.target.name, environment,
    releasesRoot: desktopReleasesRoot(),
  })
}

async function main(): Promise<void> {
  const invocation = parseDesktopPackageInvocation(process.argv.slice(2))
  const { target } = invocation
  const environment = target.platform === 'darwin' && invocation.unsigned
      && invocation.configEnvironment === undefined && process.env.DSH_CONFIG_ENV === undefined
    ? localMacOSPackageEnvironment()
    : loadDesktopPackageEnvironment(target.platform)
  const configEnvironment = invocation.configEnvironment ?? (environment.DSH_CONFIG_ENV?.trim() || undefined)
  const productVersion = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  // Release settings come from the target dotenv file alone, so the version this run publishes is an
  // argument; the environment variable below only carries it to the child processes that build.
  const buildVersion = await resolveRequestedBuildVersion(invocation, productVersion, environment)
  environment[DESKTOP_BUILD_VERSION_ENV] = buildVersion
  let selectedPrivateDesktopUpdates: ReturnType<typeof readPrivateDesktopUpdates> | undefined
  let configuredPrivateMarket = false
  if (configEnvironment !== undefined) {
    const configRoot = environment.DSH_CONFIG_ENV_DIR
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(configEnvironment)) throw new Error('desktop package: invalid config environment name')
    if (configRoot === undefined || configRoot === '') throw new Error('desktop package: set DSH_CONFIG_ENV_DIR to read a named environment')
    let document: unknown
    try { document = JSON.parse(readFileSync(join(configRoot, configEnvironment, 'config.json'), 'utf8')) }
    catch (error) { throw new Error(`desktop package: cannot read selected config environment ${configEnvironment}`, { cause: error }) }
    if (!isRecord(document) || document.schemaVersion !== 1 || document.environment !== configEnvironment) {
      throw new Error('desktop package: selected config environment must match schemaVersion 1 and its name')
    }
    configuredPrivateMarket = isRecord(document.plugins) && 'privateMarket' in document.plugins
    if (isRecord(document.desktop) && 'updates' in document.desktop) {
      assertPrivateDesktopUpdateTarget(target)
      selectedPrivateDesktopUpdates = readPrivateDesktopUpdates(configRoot, configEnvironment)
      environment.DSH_DESKTOP_PRIVATE_UPDATE_CONFIG = JSON.stringify(selectedPrivateDesktopUpdates)
    }
    if (!configuredPrivateMarket && selectedPrivateDesktopUpdates === undefined && !invocation.preinstallPrivatePlugins) {
      throw new Error('desktop package: selected config environment must configure plugins.privateMarket or desktop.updates')
    }
  }
  if (invocation.check) {
    validateDesktopPackageEnvironment(environment, target, {
      ...invocation, privateDesktopUpdates: selectedPrivateDesktopUpdates !== undefined,
    })
    if (configEnvironment !== undefined) {
      if (configuredPrivateMarket) {
        readPrivateMarketEnvironment(environment.DSH_CONFIG_ENV_DIR, configEnvironment)
        const source = resolvePrivateMarketSource(REPOSITORY_ROOT, environment)
        const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { name?: unknown }
        if (manifest.name !== '@deepseek-ai/dsh-private-market') throw new Error(`desktop package: invalid private market source ${source}`)
      }
    }
    if (invocation.preinstallPrivatePlugins) {
      for (const [source, packageName] of [
        [resolvePrivateMarketSource(REPOSITORY_ROOT, environment), '@deepseek-ai/dsh-private-market'],
        [resolveProAuthSource(REPOSITORY_ROOT, environment), 'dsh-pro-auth'],
      ] as const) {
        const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as { name?: unknown }
        if (manifest.name !== packageName) throw new Error(`desktop package: invalid preinstalled plugin source ${source}`)
      }
    }
    await requireDesktopToolchain(target.platform, environment)
    process.stdout.write(`desktop package: ${target.name} would package ${buildVersion}; local configuration and toolchain valid, signing and notarization were not attempted\n`)
    return
  }
  process.stdout.write(`desktop package: ${target.name} publishes ${buildVersion}${buildVersion === productVersion ? '' : ` for product version ${productVersion}`}\n`)
  const packaged = readDesktopBuildCommit(REPOSITORY_ROOT)
  Object.assign(environment, desktopBuildCommitEnvironment(packaged))
  const secrets = Object.entries(environment).filter(([name]) => /KEY|SECRET|TOKEN|PASSWORD|APPLE_ID/iu.test(name)).map(([, value]) => value ?? '')
  const run = createPackagingRun(join(APP_ROOT, '.desktop-build', 'packaging-runs'), {
    target: target.name,
    unsigned: invocation.unsigned,
    internalDmg: invocation.internalDmg,
    directory: invocation.directory,
    prepareOnly: invocation.prepareOnly,
    version: buildVersion, productVersion, node: process.version,
    commit: packaged.commit,
    dirty: packaged.dirty,
  }, { parallel: target.platform === 'darwin', secrets })
  console.log(`DESKTOP_PACKAGING_RECORD ${run.directory}`)
  const previousDirectory = process.env.DSH_DESKTOP_PACKAGING_RUN_DIR
  process.env.DSH_DESKTOP_PACKAGING_RUN_DIR = run.directory
  let success = false
  try {
    await packagingStep(run.directory, 'configuration', async () => {
      validateDesktopPackageEnvironment(environment, target, {
        ...invocation, privateDesktopUpdates: selectedPrivateDesktopUpdates !== undefined,
      })
    }, secrets)
    await packagingStep(run.directory, 'toolchain', () => requireDesktopToolchain(target.platform, environment), secrets)
    if (target.platform === 'darwin') {
      const settings = resolveMacOSPackageSettings(environment)
      recordPackagingEvent(run.directory, { type: 'macos-settings', packConcurrency: settings.packConcurrency,
        downloadProxyConfigured: settings.downloadProxy !== undefined,
        notarizationProxyConfigured: settings.notarizationProxy !== undefined })
      await packagingStep(run.directory, 'macos-package', () => invocation.unsigned || invocation.internalDmg
        ? packageTarget(invocation, environment, run, configuredPrivateMarket ? configEnvironment : undefined)
        : withMacOSSigningKeychain(environment, signingEnvironment => packageTarget(invocation, signingEnvironment, run,
          configuredPrivateMarket ? configEnvironment : undefined)), secrets)
    } else {
      await packagingStep(run.directory, 'windows-package', () => packageTarget(invocation, environment, run,
        configuredPrivateMarket ? configEnvironment : undefined), secrets)
    }
    success = true
  } catch (error) {
    process.stderr.write(`${packagingErrorDetails(error, secrets)}\n`)
    process.stderr.write(`desktop package: failed; see ${run.directory}/events.jsonl\n`)
    process.exitCode = 1
  } finally {
    if (previousDirectory === undefined) delete process.env.DSH_DESKTOP_PACKAGING_RUN_DIR
    else process.env.DSH_DESKTOP_PACKAGING_RUN_DIR = previousDirectory
    run.finish(success)
  }
  if (success && target.platform === 'darwin' && !invocation.directory && !invocation.prepareOnly) {
    const paths = desktopTargetBuildPaths(target.name)
    const filename = `deepseek-harness-${buildVersion}-mac-${target.arch}${invocation.unsigned ? '-unsigned' : invocation.internalDmg ? '-internal' : ''}.dmg`
    console.log(`DMG: ${join(invocation.unsigned ? paths.unsignedArtifacts
      : invocation.internalDmg ? desktopTargetInternalArtifactsDirectory(target.name, buildVersion)
        : desktopTargetReleaseArtifactsDirectory(target.name, buildVersion), filename)}`)
  }
}

/**
 * Prepare one release only after its signing preflight, without publishing from the builder.
 * @param invocation Validated host, target and packaging mode.
 * @param environment File-owned release configuration.
 * @param run Persistent stage supervisor; required for signed Windows packaging and enabled for all release commands.
 * @param configuredMarketEnvironment Selected environment name when it configures the private market.
 * @returns Resolves after preparation or complete packaging; any failed stage prevents a release record.
 */
export async function packageTarget(
  invocation: DesktopPackageInvocation,
  environment: NodeJS.ProcessEnv,
  run: ReturnType<typeof createPackagingRun> | undefined,
  configuredMarketEnvironment?: string,
): Promise<void> {
  const { target } = invocation
  const execute = (args: readonly string[], env: NodeJS.ProcessEnv, cwd: string = APP_ROOT) => runPnpm(args, env, cwd, run)
  const journal = target.platform === 'darwin' ? process.env.DSH_DESKTOP_PACKAGING_RUN_DIR : undefined
  const proxyEvent = (status: string) => { if (journal) recordPackagingEvent(journal, { type: 'notarization-proxy', status }) }
  const mac = target.platform === 'darwin' ? resolveMacOSPackageSettings(environment) : undefined
  const packArguments = mac === undefined ? [] : ['--concurrency', String(mac.packConcurrency)]
  const buildPaths = desktopTargetBuildPaths(target.name)
  const productVersion = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const buildVersion = resolveDesktopBuildVersion(environment, productVersion)
  const artifactsRoot = invocation.unsigned ? buildPaths.unsignedArtifacts
    : invocation.internalDmg ? desktopTargetInternalArtifactsDirectory(target.name, buildVersion)
      : desktopTargetReleaseArtifactsDirectory(target.name, buildVersion)
  const releaseRecordPath = join(artifactsRoot, desktopBuildRecordFilename(target.name))
  if (!invocation.prepareOnly && !invocation.unsigned && !invocation.internalDmg) {
    rmSync(releaseRecordPath, { force: true })
    rmSync(`${releaseRecordPath}.tmp`, { force: true })
  }
  const buildEnv = withoutWindowsSigningEnvironment(withoutDesktopUploadCredentials(
    desktopElectronBuilderEnvironment(environment, invocation.unsigned)))
  const targetEnv: NodeJS.ProcessEnv = {
    ...buildEnv,
    DSH_DESKTOP_TARGET_PLATFORM: target.platform,
    DSH_DESKTOP_TARGET_ARCH: target.arch,
  }
  const downloadEnv = macOSDownloadEnvironment(targetEnv, mac?.downloadProxy)
  const electronBuilderEnv = desktopElectronBuilderEnvironment(downloadEnv, invocation.unsigned, invocation.internalDmg)
  for (const name of WINDOWS_SIGNING_ENV_NAMES) {
    if (!invocation.unsigned && environment[name] !== undefined) electronBuilderEnv[name] = environment[name]
  }
  const signPrimaryRuntime = target.platform === 'win32' && !invocation.unsigned && !invocation.prepareOnly
  const signedStage = async (stage: string, operation: () => Promise<void>): Promise<void> => {
    if (!signPrimaryRuntime) return operation()
    if (run === undefined) throw new Error('desktop package: signed Windows packaging requires a supervised run')
    const controller = new AbortController()
    const interrupted = (): void => controller.abort()
    const detach = (): void => {
      process.removeListener('SIGINT', interrupted)
      process.removeListener('SIGTERM', interrupted)
    }
    process.once('SIGINT', interrupted)
    process.once('SIGTERM', interrupted)
    try {
      const options = { stage, signal: controller.signal, record: (event: object): void => recordPackagingEvent(run.directory, event) }
      await withWindowsSigningStage(options, async () => {
        detach()
        await operation()
      })
    } finally { detach() }
  }
  if (signPrimaryRuntime) {
    if (run === undefined) throw new Error('desktop package: signed Windows packaging requires a supervised run')
    await signedStage('preflight', async () => {
      await prepareWindowsSignatureCacheDirectory(resolveWindowsSignatureCacheDirectory(environment))
      await run.run('preflight:windows-signing', process.execPath,
        ['--import', 'tsx/esm', join(APP_ROOT, 'scripts/windows-signing-preflight.ts')],
        { cwd: APP_ROOT, env: electronBuilderEnv, timeoutMs: 60_000 })
    })
  }
  await execute(['run', 'build:official'], buildEnv, REPOSITORY_ROOT)
  await execute(['run', 'release:pack', '--family', 'dsh', '--out', buildPaths.packedDsh, ...packArguments], buildEnv, REPOSITORY_ROOT)
  if (invocation.preinstallPrivatePlugins || configuredMarketEnvironment !== undefined) {
    const source = resolvePrivateMarketSource(REPOSITORY_ROOT, environment)
    const authSource = resolveProAuthSource(REPOSITORY_ROOT, environment)
    await execute(['run', 'build'], buildEnv, source)
    if (invocation.preinstallPrivatePlugins) await execute(['run', 'build'], buildEnv, authSource)
    const marketRecord = await packagePrivateMarket({
      repositoryRoot: REPOSITORY_ROOT,
      source,
      ...(invocation.preinstallPrivatePlugins ? { authSource } : {}),
      configRoot: environment.DSH_CONFIG_ENV_DIR,
      ...(configuredMarketEnvironment !== undefined
        ? { environment: configuredMarketEnvironment }
        : {}),
      output: buildPaths.packedDsh,
      runPnpm: (args, cwd) => execute(args, buildEnv, cwd),
    })
    if (run !== undefined) recordPackagingEvent(run.directory, { type: 'private-market', ...marketRecord })
  }
  await execute([
    '--dir',
    'apps/desktop-host',
    'pack',
    '--pack-destination',
    buildPaths.packedDsh,
  ], buildEnv, REPOSITORY_ROOT)
  await execute(['run', 'release:pack', '--family', 'vendor', '--out', buildPaths.packedVendor, ...packArguments], buildEnv, REPOSITORY_ROOT)
  rmSync(buildPaths.packedLandlock, { recursive: true, force: true })
  mkdirSync(buildPaths.packedLandlock, { recursive: true })
  await execute(['--dir', 'native/system', 'run', 'build:ts'], buildEnv, REPOSITORY_ROOT)
  await execute([
    '--dir',
    'native/system/packages/entry',
    'pack',
    '--pack-destination',
    buildPaths.packedLandlock,
  ], buildEnv, REPOSITORY_ROOT)
  await execute(['run', 'prepare:runtime', ...(signPrimaryRuntime ? ['--defer-primary-runtime-smoke'] : [])], downloadEnv)
  if (signPrimaryRuntime) await execute(['run', 'sign:primary-runtime'], electronBuilderEnv)
  await execute(['run', 'prepare:packages'], targetEnv)
  await execute(['run', 'prepare:dsh', ...(signPrimaryRuntime ? ['--defer-runtime-smoke'] : [])],
    invocation.internalDmg ? electronBuilderEnv : downloadEnv)
  if (signPrimaryRuntime) await execute(['run', 'sign:primary-runtime', '--dsh'], electronBuilderEnv)
  if (invocation.prepareOnly) return
  if (invocation.internalDmg) {
    await execute(desktopElectronBuilderArguments(target, false), electronBuilderEnv)
    await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--internal-dmg'], electronBuilderEnv)
  } else if (target.platform === 'darwin' && !invocation.unsigned && !invocation.directory) {
    await execute([
      ...desktopElectronBuilderArguments(target, true),
      '--config.mac.notarize=false',
    ], electronBuilderEnv)
    await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts'], targetEnv)
    await withMacOSNotarizationProxy(mac?.notarizationProxy, () => packageMacOSArtifacts({
      arch: target.arch,
      // electron-builder named these artifacts after the published version, so locating them uses the same identifier.
      version: resolveDesktopBuildVersion(environment, packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')),
      artifactsRoot,
      environment: electronBuilderEnv,
    }, artifact => execute(desktopElectronBuilderArguments(target, false, artifact), electronBuilderEnv)), undefined, undefined, proxyEvent)
  } else if (target.platform === 'darwin' && !invocation.unsigned) {
    await execute([...desktopElectronBuilderArguments(target, true), '--config.mac.notarize=false'], electronBuilderEnv)
    await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts'], targetEnv)
    const appPath = join(artifactsRoot, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app')
    await withMacOSNotarizationProxy(mac?.notarizationProxy,
      () => notarizeMacOS({ appPath, ...resolveMacOSNotarizationEnvironment(environment) }), undefined, undefined, proxyEvent)
  } else {
    await signedStage('artifacts', () => execute(desktopElectronBuilderArguments(target, invocation.directory), electronBuilderEnv))
    await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', ...(invocation.unsigned ? ['--unsigned'] : [])], targetEnv)
  }
  if (!invocation.directory && !invocation.unsigned && !invocation.internalDmg) {
    await writeReleaseRecord(target, electronBuilderEnv, artifactsRoot,
      electronBuilderEnv.DSH_DESKTOP_PRIVATE_UPDATE_CONFIG !== undefined)
  }
  if (journal) recordPackagingEvent(journal, { type: 'artifacts',
    directory: artifactsRoot })
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()

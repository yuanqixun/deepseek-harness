/**
 * Resolve the version one build publishes, which is not always the version the
 * repository declares.
 *
 * Manual Desktop CI uses UTC date, workflow run number and attempt as
 * `.YYYYMMDD.run.attempt`; these identify unpublished builds, not release sequences.
 *
 * A production release publishes the Desktop package version. The bundled dsh
 * runtime keeps the root package version and is recorded separately. Automatic
 * test builds append a date and sequence number, using `test` after a stable
 * base. A manual build version may use any SemVer prerelease identifier while
 * retaining the same product version. Passing the build version here keeps it
 * out of tracked manifests while sending it to electron-builder, the update
 * feed, and upload validation.
 *
 * `electron-updater` compares feed versions with `semver.gt` against the
 * installed `app.getVersion()`, so validation uses the same library. Sequence
 * numbers order builds when preceding prerelease identifiers remain the same.
 * Any prerelease version ranks below its stable base, and its identifiers
 * participate in updater ordering independently of the update channel.
 */

import { parse } from 'semver'

/** Environment variable that carries the build version through one packaging and upload run. */
export const DESKTOP_BUILD_VERSION_ENV = 'DSH_DESKTOP_BUILD_VERSION'

/** Default prerelease field used when numbering test builds from a stable product version. */
const STABLE_TEST_FIELD = 'test'

/**
 * Parse a version the updater would accept.
 * @param {string} version - Version to read.
 * @param {string} label - Description used in failures.
 * @returns {import('semver').SemVer} The parsed version.
 */
function parseVersion(version, label) {
  const parsed = parse(version, { loose: false })
  if (parsed === null) throw new Error(`desktop build version: ${label} ${version} is not a version`)
  if (parsed.build.length > 0) {
    // Build metadata does not participate in precedence, so two builds would compare equal to the updater.
    throw new Error(`desktop build version: ${label} ${version} cannot carry build metadata`)
  }
  return parsed
}

/**
 * The prerelease fields automatic build versions start with for one product version.
 * @param {import('semver').SemVer} product - Parsed product version.
 * @returns {readonly (string | number)[]} Fields automatic build versions repeat before their date.
 */
function requiredFields(product) {
  return product.prerelease.length === 0 ? [STABLE_TEST_FIELD] : product.prerelease
}

/**
 * Validate a build version against the product version it extends.
 * @param {string} buildVersion - Version this build publishes.
 * @param {string} productVersion - Version the manifests declare.
 * @returns {string} The version as semver normalizes it, which is what the artifacts will carry.
 */
export function validateDesktopBuildVersion(buildVersion, productVersion) {
  const build = parseVersion(buildVersion, 'build version')
  const product = parseVersion(productVersion, 'product version')
  if (build.version === product.version) return build.version
  if (build.compareMain(product) !== 0) {
    throw new Error(`desktop build version: ${buildVersion} must extend product version ${productVersion}`)
  }
  const required = product.prerelease
  const extendsProduct = build.prerelease.length > required.length
    && required.every((field, index) => build.prerelease[index] === field)
  if (!extendsProduct) {
    throw new Error(
      `desktop build version: ${buildVersion} must extend product version ${productVersion} with a SemVer prerelease identifier`,
    )
  }
  return build.version
}

/**
 * Resolve the version a build publishes.
 * @param {NodeJS.ProcessEnv} env - Packaging or upload environment.
 * @param {string} productVersion - Version the manifests declare.
 * @returns {string} The build version when one is present, otherwise the product version.
 */
export function resolveDesktopBuildVersion(env, productVersion) {
  const buildVersion = env[DESKTOP_BUILD_VERSION_ENV]?.trim()
  if (buildVersion === undefined || buildVersion === '') return productVersion
  return validateDesktopBuildVersion(buildVersion, productVersion)
}

/**
 * Everything a build version carries before its date, including the trailing separator.
 * @param {string} productVersion - Version the manifests declare.
 * @returns {string} The prefix shared by every build version of that product version.
 */
export function desktopBuildVersionPrefix(productVersion) {
  const product = parseVersion(productVersion, 'product version')
  const [release] = product.version.split('-')
  return `${release}-${requiredFields(product).join('.')}.`
}

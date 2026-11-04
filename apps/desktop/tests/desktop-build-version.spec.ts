import { describe, expect, it } from 'vitest'
import {
  DESKTOP_BUILD_VERSION_ENV,
  desktopBuildVersionPrefix,
  resolveDesktopBuildVersion,
  validateDesktopBuildVersion,
} from '../scripts/desktop-build-version.mjs'

const PRERELEASE = '0.1.6-alpha.2'
const STABLE = '0.1.6'

describe('desktop build version', () => {
  it('publishes the product version when no build version is present', () => {
    expect(resolveDesktopBuildVersion({}, PRERELEASE)).toBe(PRERELEASE)
    expect(resolveDesktopBuildVersion({ [DESKTOP_BUILD_VERSION_ENV]: '   ' }, PRERELEASE)).toBe(PRERELEASE)
  })

  it.each(['0.1.6-alpha.2.20260921.1', '0.1.6-alpha.2.20260921.12'])(
    'accepts %s, which outranks the prerelease base it extends', (buildVersion) => {
      expect(resolveDesktopBuildVersion({ [DESKTOP_BUILD_VERSION_ENV]: buildVersion }, PRERELEASE)).toBe(buildVersion)
      expect(validateDesktopBuildVersion(buildVersion, PRERELEASE)).toBe(buildVersion)
    })

  it.each([
    '0.1.6-test.20260921.1',
    '0.1.6-hxfl.20260921.1',
    '0.1.6-superbpm.20260921.1',
    '0.1.6-local.20260921.1',
    '0.1.6-prod.20260921.1',
  ])('accepts %s as a labeled build on a stable base', (buildVersion) => {
    // Any prerelease ranks below the stable base; the channel is configured separately.
    expect(validateDesktopBuildVersion(buildVersion, STABLE)).toBe(buildVersion)
  })

  it.each([PRERELEASE, STABLE])('accepts %s, the product version itself', (productVersion) => {
    expect(validateDesktopBuildVersion(productVersion, productVersion)).toBe(productVersion)
  })

  it.each(['', 'nightly', '0.1.6-alpha.2.'])(
    'rejects %j as a version', (buildVersion) => {
      expect(() => validateDesktopBuildVersion(buildVersion, PRERELEASE)).toThrow(/is not a version/u)
    })

  it('normalizes what the artifacts carry, so validation and publication agree', () => {
    expect(validateDesktopBuildVersion('v0.1.6-alpha.2.1', PRERELEASE)).toBe('0.1.6-alpha.2.1')
  })

  it('rejects build metadata, which does not affect updater precedence', () => {
    expect(() => validateDesktopBuildVersion('0.1.6-alpha.2.1+build', PRERELEASE)).toThrow(/build metadata/u)
  })

  it.each(['0.1.7-alpha.2.20260921.1', '0.2.6-alpha.2.20260921.1'])(
    'rejects %s because it leaves the product release numbers', (buildVersion) => {
      expect(() => validateDesktopBuildVersion(buildVersion, PRERELEASE)).toThrow(/must extend product version/u)
    })

  it.each(['0.1.6-beta.2.20260921.1', '0.1.6-alpha.3', '0.1.6'])(
    'rejects %s because it does not extend the product prerelease', (buildVersion) => {
      expect(() => validateDesktopBuildVersion(buildVersion, PRERELEASE)).toThrow(/must extend product version/u)
    })

  it('rejects the stable base without a prerelease identifier as a build version', () => {
    expect(() => validateDesktopBuildVersion(STABLE, '0.1.6-rc.1')).toThrow(/must extend product version/u)
  })

  it('keeps requiring a build identifier to extend the product prerelease', () => {
    expect(() => validateDesktopBuildVersion('0.1.6-beta.2', PRERELEASE)).toThrow(/must extend product version/u)
  })

  it('rejects build versions that change the product prerelease family', () => {
    expect(() => validateDesktopBuildVersion('0.1.6-beta.2.20260921.1', PRERELEASE)).toThrow(/must extend product version/u)
  })

  it.each([[PRERELEASE, '0.1.6-alpha.2.'], [STABLE, '0.1.6-test.']])(
    'opens %s build versions with %s', (productVersion, prefix) => {
      expect(desktopBuildVersionPrefix(productVersion)).toBe(prefix)
    })
})

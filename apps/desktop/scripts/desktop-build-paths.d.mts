import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/** Build, local artifact, and immutable download paths for one release target. */
export interface DesktopTargetBuildPaths {
  readonly root: string
  readonly artifacts: string
  readonly unsignedArtifacts: string
  readonly internalArtifacts: string
  readonly runtime: string
  readonly packageSet: string
  readonly dsh: string
  readonly dshPnpm: string
  readonly electron: string
  readonly packedDsh: string
  readonly packedVendor: string
  readonly packedLandlock: string
  readonly downloads: string
}

/**
 * Resolve the fixed build target selected by a packaging environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopAutoUpdateTarget

/**
 * Return the build and local artifact directories owned by one release target.
 * @param target - Supported Desktop target name.
 * @returns Preparation and local artifact paths plus the shared immutable download cache.
 */
export function desktopTargetBuildPaths(target: DesktopAutoUpdateTarget): DesktopTargetBuildPaths

/**
 * Return the repository directory that retains versioned Desktop artifacts.
 * @returns The repository releases directory.
 */
export function desktopReleasesRoot(): string

/**
 * Return the versioned artifact directory for one platform and architecture.
 * @param target - Supported release target.
 * @param version - Validated Desktop build version.
 * @param releasesRoot - Root directory that contains versioned release folders.
 * @returns The target's versioned artifact directory.
 */
export function desktopTargetReleaseArtifactsDirectory(target: DesktopAutoUpdateTarget, version: string, releasesRoot?: string): string

/**
 * Return the platform and architecture of the payload one release target prepares.
 * Windows is prepared as x64 only, so this differs from the build host on an arm64 Windows machine.
 * @param target - Supported Desktop target name.
 * @returns Platform and architecture of the prepared payload.
 */
export function desktopTargetPlatform(target: DesktopAutoUpdateTarget): {
  readonly platform: 'darwin' | 'win32'
  readonly arch: 'arm64' | 'x64'
}

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopTargetBuildPaths

/**
 * Resolve the primary-runtime directory an unpackaged development launch uses.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Primary-runtime directory prepared for the selected target.
 */
export function developmentRuntimeDirectory(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): string

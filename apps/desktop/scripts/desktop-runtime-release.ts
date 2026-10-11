/** Read release metadata for the DSH runtime bundled by Desktop. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { parseDesktopRelease, type DesktopRelease } from '../src/release.ts'

function packageVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`desktop runtime: ${subject} has no version`)
  return manifest.version
}

/**
 * Read the DSH version and runtime versions used by the bundled runtime descriptor.
 * @param repositoryRoot - Harness repository root containing the DSH package manifest.
 * @param runtimeRoot - Prepared runtime directory containing `versions.json`.
 * @returns Runtime release metadata independent of the Electron package version.
 */
export function readDesktopRuntimeRelease(repositoryRoot: string, runtimeRoot: string): DesktopRelease {
  const runtime = JSON.parse(readFileSync(join(runtimeRoot, 'versions.json'), 'utf8')) as Record<string, unknown>
  return parseDesktopRelease({
    schemaVersion: 1,
    version: packageVersion(join(repositoryRoot, 'package.json'), 'root dsh package'),
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: runtime.node,
    pnpmVersion: runtime.pnpm,
  })
}

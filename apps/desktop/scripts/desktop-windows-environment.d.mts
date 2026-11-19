/** Validated installation and storage paths for one Windows Desktop environment. */
export interface DesktopWindowsEnvironment {
  readonly appId: string
  readonly installDirectory: string
  readonly dshHome: string
  readonly userDataDirectory: string
}

/**
 * Resolve and validate Windows installation and storage settings.
 * @param value Selected environment's `desktop.windows` value.
 * @returns Normalized Windows settings.
 */
export function resolveDesktopWindowsEnvironment(value: unknown): DesktopWindowsEnvironment

/**
 * Read Windows installation settings from one environment document.
 * @param document Selected environment document.
 * @returns Normalized Windows settings.
 */
export function readDesktopWindowsEnvironment(
  document: Record<string, unknown>,
): DesktopWindowsEnvironment

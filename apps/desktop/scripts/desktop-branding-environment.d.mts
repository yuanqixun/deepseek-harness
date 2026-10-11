export interface DesktopBranding {
  displayName: string
  iconSet: string
  artifactNameBase: string
}

export const DESKTOP_BRANDING_ENV: string
export const DEFAULT_DESKTOP_DISPLAY_NAME: string
export const DEFAULT_DESKTOP_ARTIFACT_NAME_BASE: string
export const DEFAULT_DESKTOP_ICON_SET: string
export function resolveDesktopBranding(value?: unknown): DesktopBranding
export function readDesktopBranding(configRoot: string | undefined, environment: string): DesktopBranding
export function resolveDesktopIconSet(root: string, iconSet?: string): Record<string, string>
export function desktopBrandingFromEnvironment(environment?: NodeJS.ProcessEnv): DesktopBranding

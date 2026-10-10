export interface PrivateDesktopUpdateEnvironment {
  environment: string
  distribution: string
  checkUrl: string
  channel: string
  feedOrigins: string[]
}

export function resolvePrivateDesktopUpdates(value: unknown, environment: string): PrivateDesktopUpdateEnvironment
export function readPrivateDesktopUpdates(configRoot: string | undefined, environment: string): PrivateDesktopUpdateEnvironment

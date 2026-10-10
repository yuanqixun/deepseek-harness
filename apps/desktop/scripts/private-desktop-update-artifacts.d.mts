export interface PrivateDesktopUpdateArtifact {
  readonly kind: 'updater-payload' | 'blockmap' | 'direct-installer'
  readonly filename: string
  readonly size: number
  readonly sha512: string
}

export function verifyPrivateDesktopUpdateArtifacts(
  root: string,
  target: { readonly name: string; readonly platform: string; readonly arch: string },
  version: string,
): Promise<{ readonly metadata: { readonly filename: string; readonly version: string }; readonly artifacts: readonly PrivateDesktopUpdateArtifact[] }>

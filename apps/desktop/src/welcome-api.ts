/** Operations available to the isolated native welcome renderer. */

import type { ProductEventMap } from '@deepseek-ai/dsh-client-product-analytics/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  analytics: 'dsh-welcome:analytics',
  analyticsEnabled: 'dsh-welcome:analytics-enabled',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
} as const

/** Credential writes return a safe outcome without exposing Host diagnostics. */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false }

/** One-time notification retained by the main process until Welcome receives it. */
export type WelcomeNotice = 'session-expired'

/** Account facts the native welcome page needs to show the selected sign-in flow. */
export interface WelcomeSignInState {
  readonly status: 'signed-out' | 'credential-stored'
  readonly attempt: WelcomeSignInAttempt | null
}

/** Browser authorization attempt projected without provider-specific account links. */
export interface WelcomeSignInAttempt {
  readonly id: string
  readonly phase: 'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'
  readonly authorizeUrl?: string
  readonly expiresAt?: number
}

/** Selected provider for the initial Desktop sign-in flow. */
export type WelcomeAuthProvider = 'deepseek-official' | 'dsh-pro-auth'

type WelcomeEventName = 'auth_page_view' | 'auth_page_click' | 'api_key_save_click'

/** Host-owned operations used by the welcome window. */
export interface WelcomeOperations {
  /** @param eventName - allowed welcome event. @param attributes - approved fields without credentials. */
  analytics?<K extends WelcomeEventName>(eventName: K, attributes: ProductEventMap[K]): Promise<void>
  /** @returns the Host's current effective collection policy. */
  analyticsEnabled(): Promise<boolean>
  /** @returns the pending notification, clearing it before another renderer can receive it. */
  takeNotice(): Promise<WelcomeNotice | undefined>
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<WelcomeSignInState>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: string): Promise<WelcomeSignInState>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: string): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
}

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeOperations & {
  readonly authProvider?: WelcomeAuthProvider
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: WelcomeSignInState) => void): () => void
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
  readonly authProvider?: WelcomeAuthProvider
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @returns true only when neither authentication route is configured.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  return authentication.authProvider === 'dsh-pro-auth'
    ? !authentication.loggedIn
    : !authentication.loggedIn && !authentication.hasApiKey
}

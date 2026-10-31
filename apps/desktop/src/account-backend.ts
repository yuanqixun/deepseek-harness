/** Native account commands and Gateway state stream; no renderer receives credentials. */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { parseRemoteStreamServerMessage, REMOTE_STREAM_MUX_PATH } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import type { AccountClientMetadata, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { WelcomeSignInAttempt, WelcomeSignInState } from './welcome-api.ts'

/** Authenticated unary caller shared with native onboarding. */
export type AccountInvoke = (request:
  | { namespace: string; method: string; args: Record<string, unknown> }
  | { channel: '/dsh-pro-auth'; method: string; args: Record<string, unknown> },
) => Promise<unknown>

/** Decode the UI-safe state received across HTTP or WebSocket. @param value - wire value. @returns account projection. */
export function accountView(value: unknown): AccountView {
  if (typeof value !== 'object' || value === null || !('status' in value)
    || !['signed-out', 'credential-stored'].includes(String(value.status)) || !('attempt' in value)) {
    throw new Error('desktop account: invalid state')
  }
  if (!('links' in value) || typeof value.links !== 'object' || value.links === null
    || !('usageUrl' in value.links) || typeof value.links.usageUrl !== 'string'
    || !('topUpUrl' in value.links) || typeof value.links.topUpUrl !== 'string') {
    throw new Error('desktop account: invalid platform links')
  }
  validateBrowserDestination(value.links.usageUrl)
  validateBrowserDestination(value.links.topUpUrl)
  const attempt = value.attempt
  if (attempt !== null && (typeof attempt !== 'object' || !('id' in attempt) || typeof attempt.id !== 'string'
    || !('phase' in attempt) || !['initializing', 'waiting-browser', 'exchanging', 'committing', 'succeeded', 'cancelled', 'expired', 'failed'].includes(String(attempt.phase))
    || ('authorizeUrl' in attempt && typeof attempt.authorizeUrl !== 'string')
    || ('expiresAt' in attempt && (typeof attempt.expiresAt !== 'number' || !Number.isFinite(attempt.expiresAt)))
    || ('errorCode' in attempt && !['no-response', 'network', 'protocol', 'expired', 'storage'].includes(String(attempt.errorCode))))) {
    throw new Error('desktop account: invalid attempt')
  }
  if (attempt !== null && 'authorizeUrl' in attempt) {
    validateBrowserDestination(String(attempt.authorizeUrl))
  }
  const parsed = value as AccountView
  return {
    status: parsed.status,
    links: { usageUrl: parsed.links.usageUrl, topUpUrl: parsed.links.topUpUrl },
    attempt: parsed.attempt === null ? null : {
      id: parsed.attempt.id, phase: parsed.attempt.phase,
      ...parsed.attempt.authorizeUrl === undefined ? {} : { authorizeUrl: parsed.attempt.authorizeUrl },
      ...parsed.attempt.expiresAt === undefined ? {} : { expiresAt: parsed.attempt.expiresAt },
      ...parsed.attempt.errorCode === undefined ? {} : { errorCode: parsed.attempt.errorCode },
    },
  }
}

/** Only HTTP loopback or HTTPS destinations can leave the native app. */
function validateBrowserDestination(value: string): void {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error('desktop account: invalid browser destination')
  }
}

/** Native account operations and explicitly owned stream lifetime. */
export interface DesktopAccountBackend {
  /** @returns current account snapshot. */
  state(): Promise<WelcomeSignInState>
  /** @param client - this window's identity and current language. @returns new or already-running login attempt. */
  start(client?: AccountClientMetadata): Promise<WelcomeSignInState>
  /** @param id - attempt to cancel. @returns cancellation or completed commit state. */
  cancel(id: string): Promise<WelcomeSignInState>
  /** @param client - this window's identity and current language. @returns signed-out state. */
  signOut(client: AccountClientMetadata): Promise<WelcomeSignInState>
  /**
   * @param listener - state recipient.
   * @param failed - stream failure recipient.
   * @param expired - live credential-expiry recipient.
   * @param onAnalyticsEnabledChanged - optional Desktop collection-policy recipient; disconnected streams publish false.
   * @returns stream disposer.
   */
  watch(
    listener: (state: WelcomeSignInState) => void, failed: () => void, expired: () => void,
    onAnalyticsEnabledChanged?: (enabled: boolean) => void,
  ): () => void
}

/**
 * Connect native account operations to the standard authenticated Web backend.
 * @param origin - Host Web origin.
 * @param invoke - validated unary RPC caller.
 * @param cookies - Electron session cookie reader.
 * @returns account operations; watch callers own their subscriptions.
 */
export function desktopAccountBackend(origin: string, invoke: AccountInvoke, cookies: () => Promise<string>): DesktopAccountBackend {
  const project = (state: AccountView): WelcomeSignInState => ({ status: state.status,
    attempt: state.attempt === null ? null : {
      id: state.attempt.id,
      phase: state.attempt.phase,
      ...state.attempt.authorizeUrl === undefined ? {} : { authorizeUrl: state.attempt.authorizeUrl },
      ...state.attempt.expiresAt === undefined ? {} : { expiresAt: state.attempt.expiresAt },
    } })
  const call = async (method: string, args: Record<string, unknown> = {}): Promise<WelcomeSignInState> =>
    project(accountView(await invoke({ namespace: 'account', method, args })))
  return {
    state: () => call('getState'),
    start: client => call('startSignIn', { client, callbackOrigin: new URL(origin).origin, loginSource: 'desktop' }),
    cancel: attemptId => call('cancelSignIn', { attemptId }),
    signOut: client => call('signOut', { client }),
    watch(listener, failed, expired, onAnalyticsEnabledChanged) {
      let closed = false
      let socket: WebSocket | undefined
      let retry: ReturnType<typeof setTimeout> | undefined
      const connect = (): void => {
        const streamId = randomUUID()
        const expiryStreamId = randomUUID()
        const analyticsPolicyStreamId = randomUUID()
        void cookies().then((cookie) => {
          if (closed) return
          const url = new URL(REMOTE_STREAM_MUX_PATH, origin)
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          socket = new WebSocket(url, { headers: { cookie, origin }, maxPayload: 65_536 })
          socket.on('open', () => {
            if (onAnalyticsEnabledChanged !== undefined) socket?.send(JSON.stringify({ type: 'open', streamId: analyticsPolicyStreamId, endpoint: 'productAnalytics/watchPolicy', payload: { args: {} } }))
            socket?.send(JSON.stringify({ type: 'open', streamId: expiryStreamId, endpoint: 'account/watchExpiry', payload: { args: {} } }))
            socket?.send(JSON.stringify({ type: 'open', streamId, endpoint: 'account/watch', payload: { args: {} } }))
          })
          socket.on('message', (data) => {
            try {
              const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
              const frame = parseRemoteStreamServerMessage(bytes.toString('utf8'))
              if (frame.streamId === analyticsPolicyStreamId) {
                if (frame.type === 'item' && typeof frame.value === 'boolean') onAnalyticsEnabledChanged?.(frame.value)
                else onAnalyticsEnabledChanged?.(false)
                return
              }
              if (frame.streamId === expiryStreamId && frame.type === 'item' && frame.value === 'session-expired') { expired(); return }
              if (frame.streamId !== streamId) throw new Error('desktop account: unexpected stream')
              if (frame.type === 'item') listener(project(accountView(frame.value)))
              else socket?.close()
            } catch { socket?.close() }
          })
          socket.on('error', () => { socket?.close() })
          socket.on('close', () => { if (!closed) { onAnalyticsEnabledChanged?.(false); failed(); retry = setTimeout(connect, 1000) } })
        }).catch(() => { if (!closed) { onAnalyticsEnabledChanged?.(false); failed(); retry = setTimeout(connect, 1000) } })
      }
      connect()
      return () => { closed = true; onAnalyticsEnabledChanged?.(false); clearTimeout(retry); socket?.close() }
    },
  }
}

interface CasAuthStatus {
  readonly phase: 'unauthenticated' | 'authenticating' | 'authenticated'
  readonly expiresAt?: number
}

/** Connect native welcome sign-in to the preinstalled DSH CAS plugin RPC. */
export function desktopProAuthBackend(invoke: AccountInvoke): DesktopAccountBackend {
  let attemptId: string | undefined
  let loginUrl: string | undefined
  const parseStatus = (value: unknown): CasAuthStatus => {
    if (!isRecord(value) || (value.phase !== 'unauthenticated'
      && value.phase !== 'authenticating' && value.phase !== 'authenticated')) {
      throw new Error('企业登录服务返回了无效状态。')
    }
    const expiresAt = value.expiresAt
    if (expiresAt !== undefined && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt))) {
      throw new Error('企业登录服务返回了无效登录期限。')
    }
    if (value.phase === 'authenticating' && typeof expiresAt !== 'number') {
      throw new Error('企业登录服务返回了无效登录期限。')
    }
    return { phase: value.phase, ...(typeof expiresAt === 'number' ? { expiresAt } : {}) }
  }
  const readStatus = async (): Promise<CasAuthStatus> => parseStatus(
    await invoke({ channel: '/dsh-pro-auth', method: 'status', args: {} }),
  )
  const project = (status: CasAuthStatus, phase?: WelcomeSignInAttempt['phase']): WelcomeSignInState => {
    if (status.phase === 'authenticated') {
      attemptId = undefined
      loginUrl = undefined
      return { status: 'credential-stored', attempt: null }
    }
    if (status.phase === 'authenticating') {
      attemptId ??= randomUUID()
      return {
        status: 'signed-out',
        attempt: {
          id: attemptId,
          phase: loginUrl === undefined ? 'initializing' : 'waiting-browser',
          ...(loginUrl === undefined ? {} : { authorizeUrl: loginUrl }),
          ...(status.expiresAt === undefined ? {} : { expiresAt: status.expiresAt }),
        },
      }
    }
    if (attemptId !== undefined && phase !== undefined) return { status: 'signed-out', attempt: { id: attemptId, phase } }
    return { status: 'signed-out', attempt: null }
  }
  const state = async (): Promise<WelcomeSignInState> => project(await readStatus(), 'failed')
  const start = async (): Promise<WelcomeSignInState> => {
    const value = await invoke({ channel: '/dsh-pro-auth', method: 'start', args: {} })
    if (!isRecord(value) || !('status' in value)
      || (value.loginUrl !== undefined && typeof value.loginUrl !== 'string')) {
      throw new Error('企业登录服务返回了无效登录结果。')
    }
    if (typeof value.loginUrl === 'string') validateBrowserDestination(value.loginUrl)
    loginUrl = typeof value.loginUrl === 'string' ? value.loginUrl : undefined
    attemptId ??= randomUUID()
    return project(parseStatus(value.status))
  }
  return {
    state,
    start,
    async signOut() {
      await invoke({ channel: '/dsh-pro-auth', method: 'logout', args: {} })
      attemptId = undefined
      loginUrl = undefined
      return state()
    },
    async cancel(id) {
      if (attemptId === undefined || id !== attemptId) return state()
      await invoke({ channel: '/dsh-pro-auth', method: 'cancel', args: {} })
      loginUrl = undefined
      const cancelledId = attemptId
      attemptId = undefined
      const current = await readStatus()
      return current.phase === 'unauthenticated'
        ? { status: 'signed-out', attempt: { id: cancelledId, phase: 'cancelled' } }
        : project(current)
    },
    watch(listener, failed) {
      let closed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const poll = async (): Promise<void> => {
        try {
          const snapshot = await state()
          if (!closed) listener(snapshot)
        } catch {
          if (!closed) failed()
        } finally {
          if (!closed) timer = setTimeout(() => { void poll() }, 1000)
        }
      }
      void poll()
      return () => { closed = true; clearTimeout(timer) }
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

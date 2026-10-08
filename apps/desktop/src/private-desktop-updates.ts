/** Anonymous version-check protocol for explicitly configured Windows Desktop distributions. */

import { gt, lt, valid } from 'semver'
import type { AppUpdater } from 'electron-updater'
import type { DesktopPolicyState } from './mandatory-update-policy.ts'
import type { DesktopUpdateHttpExecutor } from './update-http-executor.ts'

export interface PrivateDesktopUpdateConfig {
  readonly environment: string
  readonly checkUrl: string
  readonly channel: string
  readonly feedOrigins: readonly string[]
}

interface PrivateUpdateDecision {
  readonly release: { readonly version: string; readonly feedUrl: string } | null
  readonly policy: { readonly minimumSupportedVersion: string | null; readonly forceAfter: string | null }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Resolve and validate public packaged update settings. */
export function resolvePrivateDesktopUpdateConfig(value: unknown): PrivateDesktopUpdateConfig {
  const config = record(value)
  if (config === undefined || typeof config.environment !== 'string' || typeof config.channel !== 'string'
    || typeof config.checkUrl !== 'string' || !Array.isArray(config.feedOrigins) || config.feedOrigins.length === 0
    || !config.feedOrigins.every(item => typeof item === 'string')) throw new Error('desktop updates: invalid packaged configuration')
  const checkUrl = new URL(config.checkUrl)
  if (checkUrl.protocol !== 'https:' || checkUrl.username !== '' || checkUrl.password !== ''
    || checkUrl.pathname !== '/v1/desktop/updates/check' || checkUrl.search !== '' || checkUrl.hash !== '') {
    throw new Error('desktop updates: invalid check endpoint')
  }
  const feedOrigins = config.feedOrigins.map((item) => {
    const url = new URL(item)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      throw new Error('desktop updates: invalid feed origin')
    }
    return url.origin
  })
  return { environment: config.environment, channel: config.channel, checkUrl: checkUrl.href, feedOrigins }
}

function parseDecision(input: unknown, config: PrivateDesktopUpdateConfig, currentVersion: string): PrivateUpdateDecision {
  const root = record(input)
  const releaseValue = root?.release
  const releaseObject = releaseValue === null ? null : record(releaseValue)
  const policy = record(root?.policy)
  if (root?.protocolVersion !== 1 || (releaseValue !== null && releaseObject === undefined) || policy === undefined) {
    throw new Error('desktop updates: incompatible response')
  }
  let release: PrivateUpdateDecision['release'] = null
  if (releaseObject !== null) {
    const version = releaseObject?.version
    const rawFeedUrl = releaseObject?.feedUrl
    if (typeof version !== 'string' || valid(version) === null || typeof rawFeedUrl !== 'string') {
      throw new Error('desktop updates: invalid release')
    }
    const feedUrl = new URL(rawFeedUrl)
    if (feedUrl.protocol !== 'https:' || feedUrl.username !== '' || feedUrl.password !== ''
      || !config.feedOrigins.includes(feedUrl.origin) || feedUrl.search !== '' || feedUrl.hash !== '') {
      throw new Error('desktop updates: feed URL is outside configured HTTPS origins')
    }
    if (!feedUrl.pathname.endsWith('/')) feedUrl.pathname += '/'
    release = { version, feedUrl: feedUrl.href }
  }
  const minimum = policy.minimumSupportedVersion
  const forceAfter = policy.forceAfter
  if ((minimum !== null && (typeof minimum !== 'string' || valid(minimum) === null))
    || (forceAfter !== null && (typeof forceAfter !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(forceAfter) || !Number.isFinite(Date.parse(forceAfter))))
    || (minimum === null) !== (forceAfter === null)) throw new Error('desktop updates: invalid force policy')
  const minimumVersion = typeof minimum === 'string' ? minimum : null
  const deadline = typeof forceAfter === 'string' ? forceAfter : null
  if (minimumVersion !== null && deadline !== null && Date.now() >= Date.parse(deadline)
    && lt(currentVersion, minimumVersion)
    && (release === null || lt(release.version, minimumVersion) || !gt(release.version, currentVersion))) {
    throw new Error('desktop updates: forced clients must receive a newer compatible release')
  }
  return { release, policy: { minimumSupportedVersion: minimumVersion, forceAfter: deadline } }
}

/** Owns anonymous check state and sends no credentials or persistent installation identifier. */
export class PrivateDesktopUpdateClient {
  private current: DesktopPolicyState = { blocking: false, checking: false }
  private userId: string | undefined
  private pending: Promise<PrivateUpdateDecision> | undefined

  /** @param config - Validated public deployment settings.
   * @param currentVersion - Installed Desktop version.
   * @param dshVersion - Bundled dsh version.
   * @param publish - Receives force-policy state changes.
   * @param request - Anonymous HTTP transport, replaceable for tests.
   */
  constructor(
    private readonly config: PrivateDesktopUpdateConfig,
    private readonly currentVersion: string,
    private readonly dshVersion: string,
    private readonly publish: (state: DesktopPolicyState) => void,
    private readonly request: typeof fetch = fetch,
  ) {
    if (valid(currentVersion) === null || valid(dshVersion) === null) throw new Error('desktop updates: invalid installed version')
  }

  get state(): DesktopPolicyState { return this.current }

  /** Set the optional authenticated-plugin user ID in memory for the next check. */
  setUserId(value: unknown): void {
    if (value === null) { this.userId = undefined; return }
    if (typeof value !== 'string' || value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error('desktop updates: invalid user ID')
    }
    this.userId = value
  }

  /** Return the current policy decision and retain it on failed requests. */
  async check(_scenario?: string, _manual?: boolean): Promise<DesktopPolicyState> {
    try { this.applyPolicy(await this.decision()) }
    catch { /* A failed check cannot revoke a previously received force decision. */ }
    return this.current
  }

  /** Prepare the updater feed from the same coalesced response used by the policy check. */
  /** Select the feed only after validating the server decision and configure origin restrictions.
   * @param updater - Process-owned Electron updater.
   * @returns Selected release, or undefined when the service has no newer release.
   */
  async prepare(updater: AppUpdater): Promise<{ readonly version: string; readonly feedUrl: string } | undefined> {
    const decision = await this.decision()
    this.applyPolicy(decision)
    const transport = updater as AppUpdater & { httpExecutor: DesktopUpdateHttpExecutor }
    transport.httpExecutor.setAllowedOrigins(this.config.feedOrigins)
    if (decision.release === null || (gt(this.currentVersion, decision.release.version))) return undefined
    const release = decision.release
    updater.setFeedURL({ provider: 'generic', url: release.feedUrl, channel: 'nightly' })
    return release
  }

  /** Complete the policy interface; this client owns no timer or persistent resource. */
  /** Complete the policy interface; this client owns no persistent resource. */
  dispose(): void {}

  private applyPolicy(decision: PrivateUpdateDecision): void {
    const minimum = decision.policy.minimumSupportedVersion
    const forceAfter = decision.policy.forceAfter
    const blocking = minimum !== null && forceAfter !== null && Date.now() >= Date.parse(forceAfter) && lt(this.currentVersion, minimum)
    const next = { blocking, checking: false }
    this.current = next
    this.publish(next)
  }

  private decision(): Promise<PrivateUpdateDecision> {
    this.pending ??= Promise.resolve().then(async () => {
      this.setState({ ...this.current, checking: true })
      try {
        const client = { version: this.currentVersion, platform: 'win32', arch: 'x64', dshVersion: this.dshVersion,
          ...(this.userId === undefined ? {} : { userId: this.userId }) }
        const response = await this.request(this.config.checkUrl, { method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ protocolVersion: 1, distribution: this.config.environment, channel: this.config.channel, client }),
          credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`desktop updates: check returned HTTP ${response.status}`)
        return parseDecision(await response.json(), this.config, this.currentVersion)
      } finally {
        this.setState({ ...this.current, checking: false })
      }
    }).finally(() => { this.pending = undefined })
    return this.pending
  }

  private setState(state: DesktopPolicyState): void {
    this.current = state
    this.publish(state)
  }
}

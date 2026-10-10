/** Anonymous version-check protocol for explicitly configured Windows and macOS Desktop distributions. */

import { compare, gt, lt, valid } from 'semver'
import type { AppUpdater } from 'electron-updater'
import type { DesktopPolicyState } from './mandatory-update-policy.ts'
import type { DesktopUpdateHttpExecutor } from './update-http-executor.ts'

export interface PrivateDesktopUpdateConfig {
  /** Selected named environment, retained for build metadata. */
  readonly environment: string
  /** Backend distribution ID; older packaged settings default it to `environment`. */
  readonly distribution: string
  readonly checkUrl: string
  readonly channel: string
  readonly feedOrigins: readonly string[]
}

interface PrivateUpdateDecision {
  readonly release: { readonly version: string; readonly feedUrl: string } | null
  readonly policy: { readonly minimumSupportedVersion: string | null; readonly forceAfter: string | null }
  readonly releaseHistory: readonly PrivateDesktopRelease[]
}

/** Published release notes returned for one supported Desktop platform and architecture. */
export interface PrivateDesktopRelease {
  readonly version: string
  readonly platform: 'win32' | 'darwin'
  readonly arch: 'x64' | 'arm64'
  readonly releaseNotes: { readonly zh_CN: string; readonly en_US: string }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function isAllowedUpdateProtocol(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:'
}

/** Resolve and validate public packaged update settings.
 * @param value - Embedded settings selected during Desktop packaging.
 * @returns Validated configuration for anonymous update checks.
 * @throws Error when the endpoint, distribution, channel, or feed origins are invalid.
 */
export function resolvePrivateDesktopUpdateConfig(value: unknown): PrivateDesktopUpdateConfig {
  const config = record(value)
  if (config === undefined || typeof config.environment !== 'string' || typeof config.channel !== 'string'
    || typeof config.checkUrl !== 'string' || !Array.isArray(config.feedOrigins) || config.feedOrigins.length === 0
    || !config.feedOrigins.every(item => typeof item === 'string')) throw new Error('desktop updates: invalid packaged configuration')
  const distribution = config.distribution ?? config.environment
  if (typeof distribution !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(distribution)) throw new Error('desktop updates: invalid distribution')
  const checkUrl = new URL(config.checkUrl)
  if (!isAllowedUpdateProtocol(checkUrl) || checkUrl.username !== '' || checkUrl.password !== ''
    || !['/v1/desktop/updates/check', '/app-api/v1/desktop/updates/check'].includes(checkUrl.pathname)
    || checkUrl.search !== '' || checkUrl.hash !== '') {
    throw new Error('desktop updates: invalid check endpoint')
  }
  const feedOrigins = config.feedOrigins.map((item) => {
    const url = new URL(item)
    if (!isAllowedUpdateProtocol(url) || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      throw new Error('desktop updates: invalid feed origin')
    }
    return url.origin
  })
  return { environment: config.environment, distribution, channel: config.channel, checkUrl: checkUrl.href, feedOrigins }
}

function parseDecision(input: unknown, config: PrivateDesktopUpdateConfig, currentVersion: string,
  platform: 'win32' | 'darwin', arch: 'x64' | 'arm64'): PrivateUpdateDecision {
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
    if (!isAllowedUpdateProtocol(feedUrl) || feedUrl.username !== '' || feedUrl.password !== ''
      || !config.feedOrigins.includes(feedUrl.origin) || feedUrl.search !== '' || feedUrl.hash !== '') {
      throw new Error('desktop updates: feed URL is outside configured origins')
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
  const historyValue = root.releaseHistory
  if (historyValue !== undefined && !Array.isArray(historyValue)) throw new Error('desktop updates: invalid release history')
  const releaseHistory = (historyValue ?? []).map((entry): PrivateDesktopRelease => {
    const item = record(entry)
    const notes = record(item?.releaseNotes)
    if (typeof item?.version !== 'string' || valid(item.version) === null
      || (item.platform !== 'win32' && item.platform !== 'darwin')
      || (item.arch !== 'x64' && item.arch !== 'arm64')
      || typeof notes?.zh_CN !== 'string' || notes.zh_CN.length > 16_384
      || typeof notes.en_US !== 'string' || notes.en_US.length > 16_384) {
      throw new Error('desktop updates: invalid release history entry')
    }
    return { version: item.version, platform: item.platform, arch: item.arch,
      releaseNotes: { zh_CN: notes.zh_CN, en_US: notes.en_US } }
  }).filter(entry => entry.platform === platform && entry.arch === arch)
    .sort((left, right) => compare(right.version, left.version))
  return { release, policy: { minimumSupportedVersion: minimumVersion, forceAfter: deadline }, releaseHistory }
}

/** Owns anonymous check state and sends no credentials or persistent installation identifier. */
export class PrivateDesktopUpdateClient {
  private current: DesktopPolicyState = { blocking: false, checking: false }
  private userId: string | undefined
  private pending: Promise<PrivateUpdateDecision> | undefined
  private releases: readonly PrivateDesktopRelease[] = []
  private historyStatus: 'idle' | 'checking' | 'loaded' | 'failed' = 'idle'

  /** @param config - Validated public deployment settings.
   * @param currentVersion - Installed Desktop version.
   * @param dshVersion - Bundled dsh version.
   * @param publish - Receives force-policy state changes.
   * @param request - Anonymous HTTP transport, replaceable for tests.
   * @param platform - Packaged operating-system identifier.
   * @param arch - Packaged process architecture.
   */
  constructor(
    private readonly config: PrivateDesktopUpdateConfig,
    private readonly currentVersion: string,
    private readonly dshVersion: string,
    private readonly publish: (state: DesktopPolicyState) => void,
    private readonly request: typeof fetch = fetch,
    private readonly platform: 'win32' | 'darwin' = 'win32',
    private readonly arch: 'x64' | 'arm64' = 'x64',
  ) {
    if (valid(currentVersion) === null || valid(dshVersion) === null) throw new Error('desktop updates: invalid installed version')
  }

  get state(): DesktopPolicyState { return this.current }

  /** Latest validated release notes returned by the update service, filtered to this build target. */
  get releaseHistory(): readonly PrivateDesktopRelease[] { return this.releases }

  /** Whether validated release history is loading, available, or unavailable after a failed check. */
  get releaseHistoryStatus(): 'idle' | 'checking' | 'loaded' | 'failed' { return this.historyStatus }

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
    if (decision.release === null || !gt(decision.release.version, this.currentVersion)) return undefined
    const release = decision.release
    updater.setFeedURL({ provider: 'generic', url: release.feedUrl, channel: 'nightly' })
    return release
  }

  /** Complete the policy interface; this client owns no timer or persistent resource. */
  /** Complete the policy interface; this client owns no persistent resource. */
  dispose(): void {}

  private applyPolicy(decision: PrivateUpdateDecision): void {
    this.releases = decision.releaseHistory
    this.historyStatus = 'loaded'
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
      this.historyStatus = 'checking'
      try {
        const client = { version: this.currentVersion, platform: this.platform, arch: this.arch, dshVersion: this.dshVersion,
          ...(this.userId === undefined ? {} : { userId: this.userId }) }
        const response = await this.request(this.config.checkUrl, { method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ protocolVersion: 1, distribution: this.config.distribution, channel: this.config.channel, client }),
          credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`desktop updates: check returned HTTP ${response.status}`)
        return parseDecision(await response.json(), this.config, this.currentVersion, this.platform, this.arch)
      } catch (error) {
        this.historyStatus = this.releases.length === 0 ? 'failed' : 'loaded'
        throw error
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

/** Electron-native inactivity deadlines for updater checks, full downloads, and blockmap requests. */
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import type { ClientRequest, IncomingMessage } from 'electron'
import type { RequestOptions } from 'node:http'

/** Retains electron-updater transport and proxy handling while bounding silent connections. */
export class DesktopUpdateHttpExecutor extends ElectronHttpExecutor {
  private allowedOrigins: readonly string[] | undefined
  /**
   * @param idleTimeoutMs - Maximum silence before headers or between response chunks, not a total download deadline.
   * @param proxyLogin - Existing updater login event forwarding.
   */
  constructor(private readonly idleTimeoutMs: number, proxyLogin?: ConstructorParameters<typeof ElectronHttpExecutor>[0]) {
    super(proxyLogin)
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 2_147_483_647) {
      throw new Error('desktop update: HTTP idle timeout must be an integer from 1000 through 2147483647')
    }
  }

  /** Restrict feed, artifact, blockmap, and redirect requests for a private distribution. */
  setAllowedOrigins(origins: readonly string[] | undefined): void { this.allowedOrigins = origins }

  /** @param options - Electron request URL and transport options.
   * @param callback - Receives the response headers.
   * @returns The Electron request after enforcing the active origin allowlist.
   */
  override createRequest(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest {
    if (this.allowedOrigins !== undefined) {
      const host = options.hostname ?? options.host
      const protocol = options.protocol
      if (typeof host !== 'string' || protocol !== 'https:') throw new Error('desktop update: private feed request must use HTTPS')
      const origin = new URL(`${protocol}//${host}`).origin
      if (!this.allowedOrigins.includes(origin)) throw new Error('desktop update: request origin is outside the configured private feed allowlist')
    }
    return super.createRequest(options, callback)
  }

  override addErrorAndTimeoutHandlers(request: ClientRequest, reject: (error: Error) => void): void {
    // The upstream socket timer is for Node HTTP; Electron ClientRequest has response/close events instead.
    super.addErrorAndTimeoutHandlers(request, reject, this.idleTimeoutMs)
    let response: IncomingMessage | undefined
    let timer: ReturnType<typeof setTimeout>
    const stop = (): void => {
      clearTimeout(timer)
      request.off('response', onResponse)
      request.off('abort', stop)
      request.off('error', stop)
      response?.off('data', refresh)
      response?.off('end', stop)
      response?.off('error', stop)
    }
    const refresh = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stop()
        reject(Object.assign(new Error('Desktop update connection timed out'), { code: 'ETIMEDOUT' }))
        request.abort()
      }, this.idleTimeoutMs)
    }
    const onResponse = (incoming: IncomingMessage): void => {
      response = incoming
      response.on('data', refresh)
      response.once('end', stop)
      response.once('error', stop)
      refresh()
    }
    request.once('response', onResponse)
    // Electron 44 can emit writable close after finish, before response headers arrive.
    request.once('abort', stop)
    request.once('error', stop)
    refresh()
  }
}

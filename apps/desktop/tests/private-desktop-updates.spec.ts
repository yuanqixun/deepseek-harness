import { afterEach, describe, expect, it, vi } from 'vitest'
import electronUpdater from 'electron-updater'

vi.mock('electron-updater', () => ({ default: { autoUpdater: { setFeedURL: vi.fn(), httpExecutor: { setAllowedOrigins: vi.fn() } } } }))

const { PrivateDesktopUpdateClient, resolvePrivateDesktopUpdateConfig } = await import('../src/private-desktop-updates.ts')

const config = resolvePrivateDesktopUpdateConfig({ environment: 'hxfl', distribution: 'dshwork', channel: 'stable',
  checkUrl: 'https://updates.example/v1/desktop/updates/check', feedOrigins: ['https://downloads.example'] })
const updater = electronUpdater.autoUpdater
afterEach(() => { vi.clearAllMocks() })

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function decision(release: unknown = null, minimumSupportedVersion: unknown = null, forceAfter: unknown = null) {
  return { protocolVersion: 1, release, policy: { minimumSupportedVersion, forceAfter } }
}

describe('private desktop update protocol', () => {
  it('sends an anonymous version check and carries an optional user ID only when set', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(decision()))
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(), request)
    client.setUserId('user-42')
    await client.check('launch')
    expect(request).toHaveBeenCalledWith(config.checkUrl, expect.objectContaining({
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      body: JSON.stringify({ protocolVersion: 1, distribution: 'dshwork', channel: 'stable',
        client: { version: '1.2.3', platform: 'win32', arch: 'x64', dshVersion: '0.8.0', userId: 'user-42' } }),
    }))
    client.setUserId(null)
    await client.check('manual')
    expect(JSON.stringify(request.mock.calls[1]?.[1]?.body)).not.toContain('userId')
  })

  it('selects only an allowlisted HTTPS feed and pins the feed metadata to the server-selected version', async () => {
    const release = { version: '1.2.4', feedUrl: 'https://downloads.example/hxfl/stable/win-x64/' }
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(), async () => response(decision(release)))
    const setFeedURL = vi.spyOn(updater, 'setFeedURL')
    await expect(client.prepare(updater)).resolves.toEqual(release)
    expect(setFeedURL).toHaveBeenCalledWith({ provider: 'generic', url: release.feedUrl, channel: 'nightly' })
  })

  it('reports the packaged macOS arm64 platform to the version service', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(decision()))
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(), request, 'darwin', 'arm64')
    await client.check()
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      client: { platform: 'darwin', arch: 'arm64' },
    })
  })

  it('coalesces policy and updater callers into one service request', async () => {
    const release = { version: '1.2.4', feedUrl: 'https://downloads.example/hxfl/stable/win-x64/' }
    const request = vi.fn(async () => response(decision(release)))
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(), request)
    await Promise.all([client.check('launch'), client.prepare(updater)])
    expect(request).toHaveBeenCalledOnce()
  })

  it('accepts older responses without history and returns sorted notes for the packaged target', async () => {
    const oldClient = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(),
      async () => response(decision()))
    await oldClient.check()
    expect(oldClient.releaseHistory).toEqual([])

    const releaseHistory = [
      { version: '1.2.1', platform: 'win32', arch: 'x64', releaseNotes: { zh_CN: '旧版本', en_US: 'Older release' } },
      { version: '1.2.4', platform: 'darwin', arch: 'arm64', releaseNotes: { zh_CN: 'Mac 版本', en_US: 'Mac release' } },
      { version: '1.2.3', platform: 'win32', arch: 'x64', releaseNotes: { zh_CN: '当前版本', en_US: 'Current release' } },
      { version: '1.2.2', platform: 'win32', arch: 'arm64', releaseNotes: { zh_CN: '其他架构', en_US: 'Other architecture' } },
    ]
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(),
      async () => response({ ...decision(), releaseHistory }))
    await client.check()
    expect(client.releaseHistory).toEqual([releaseHistory[2], releaseHistory[0]])
  })

  it('rejects malformed history without changing the last valid release notes', async () => {
    const validHistory = [{ version: '1.2.3', platform: 'win32', arch: 'x64',
      releaseNotes: { zh_CN: '稳定性改进', en_US: 'Stability improvements' } }]
    const request = vi.fn(async () => response({ ...decision(), releaseHistory: validHistory }))
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn(), request)
    await client.check()
    request.mockImplementationOnce(async () => response({ ...decision(), releaseHistory: [{ version: 'invalid' }] }))
    await expect(client.prepare(updater)).rejects.toThrow(/release history entry/u)
    expect(client.releaseHistory).toEqual(validHistory)
  })

  it('rejects foreign feeds and malformed force policies without clearing a known block', async () => {
    const published = vi.fn()
    const blocked = decision({ version: '1.2.5', feedUrl: 'https://downloads.example/hxfl/stable/win-x64/' },
      '1.2.5', '2026-01-01T00:00:00Z')
    const request = vi.fn(async () => response(blocked))
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', published, request)
    await client.check()
    expect(client.state.blocking).toBe(true)
    request.mockImplementationOnce(async () => response(decision({ version: '1.2.4', feedUrl: 'https://evil.example/release/' })))
    await expect(client.prepare(updater)).rejects.toThrow(/configured HTTPS origins/u)
    expect(client.state.blocking).toBe(true)
    request.mockImplementationOnce(async () => response(decision(null, '1.2.5', 'later')))
    await expect(client.prepare(updater)).rejects.toThrow(/force policy/u)
    expect(client.state.blocking).toBe(true)
    request.mockImplementationOnce(async () => response({ protocolVersion: 2, release: null,
      policy: { minimumSupportedVersion: null, forceAfter: null } }))
    await expect(client.prepare(updater)).rejects.toThrow(/incompatible response/u)
    expect(client.state.blocking).toBe(true)
    request.mockRejectedValueOnce(new Error('offline'))
    await expect(client.prepare(updater)).rejects.toThrow('offline')
    expect(client.state.blocking).toBe(true)
  })

  it('rejects unsupported endpoint and invalid user IDs', () => {
    expect(() => resolvePrivateDesktopUpdateConfig({ ...config, checkUrl: 'https://updates.example/api/check' })).toThrow(/endpoint/u)
    const client = new PrivateDesktopUpdateClient(config, '1.2.3', '0.8.0', vi.fn())
    expect(() => { client.setUserId('bad\nvalue') }).toThrow(/user ID/u)
  })
})

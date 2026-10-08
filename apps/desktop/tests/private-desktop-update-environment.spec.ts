import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const { readPrivateDesktopUpdates, resolvePrivateDesktopUpdates } = await import('../scripts/private-desktop-update-environment.mjs')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('private desktop update packaging configuration', () => {
  it('selects only public desktop update fields from the named environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-private-update-'))
    roots.push(root)
    mkdirSync(join(root, 'hxfl'))
    writeFileSync(join(root, 'hxfl', 'config.json'), JSON.stringify({ schemaVersion: 1, environment: 'hxfl',
      desktop: { updates: { checkUrl: 'https://updates.example/v1/desktop/updates/check', channel: 'stable',
        feedOrigins: ['https://downloads.example'] } }, other: { token: 'not-copied' } }))
    expect(readPrivateDesktopUpdates(root, 'hxfl')).toEqual({ environment: 'hxfl',
      checkUrl: 'https://updates.example/v1/desktop/updates/check', channel: 'stable', feedOrigins: ['https://downloads.example'] })
  })

  it.each([
    [{ checkUrl: 'http://updates.example/v1/desktop/updates/check', channel: 'stable', feedOrigins: ['https://downloads.example'] }, /HTTPS/u],
    [{ checkUrl: 'https://updates.example/check', channel: 'stable', feedOrigins: ['https://downloads.example'] }, /checkUrl/u],
    [{ checkUrl: 'https://updates.example/v1/desktop/updates/check', channel: 'Stable', feedOrigins: ['https://downloads.example'] }, /channel/u],
    [{ checkUrl: 'https://updates.example/v1/desktop/updates/check', channel: 'stable', feedOrigins: ['https://downloads.example/path'] }, /origins/u],
  ])('rejects invalid deployment settings', (value, message) => {
    expect(() => resolvePrivateDesktopUpdates(value, 'hxfl')).toThrow(message)
  })

  it('rejects secret or unrecognized update fields', () => {
    expect(() => resolvePrivateDesktopUpdates({ checkUrl: 'https://updates.example/v1/desktop/updates/check',
      channel: 'stable', feedOrigins: ['https://downloads.example'], token: 'secret' }, 'hxfl')).toThrow(/unsupported field token/u)
  })
})

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { desktopBrandingFromEnvironment, readDesktopBranding, resolveDesktopBranding, resolveDesktopIconSet } from '../scripts/desktop-branding-environment.mjs'

const temporary: string[] = []

async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-branding-'))
  temporary.push(root)
  return root
}

afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('Desktop branding configuration', () => {
  it('keeps DSH defaults when configuration is absent or blank', () => {
    expect(resolveDesktopBranding()).toEqual({ displayName: 'DeepSeek Harness', iconSet: 'dsh', artifactNameBase: 'deepseek-harness' })
    expect(resolveDesktopBranding({ displayName: '', iconSet: '', artifactNameBase: '' })).toEqual(resolveDesktopBranding())
    expect(desktopBrandingFromEnvironment({})).toEqual(resolveDesktopBranding())
  })

  it('reads only the selected environment and defaults its artifact base to the display name', async () => {
    const root = await directory()
    await mkdir(join(root, 'local'))
    await mkdir(join(root, 'hxfl'))
    await mkdir(join(root, 'superbpm'))
    await writeFile(join(root, 'local/config.json'), JSON.stringify({ schemaVersion: 1, environment: 'local', desktop: { branding: { displayName: '金租办公', iconSet: 'hxfl' } } }))
    await writeFile(join(root, 'hxfl/config.json'), JSON.stringify({ schemaVersion: 1, environment: 'hxfl', desktop: { branding: { displayName: '金租办公', iconSet: 'hxfl' } } }))
    await writeFile(join(root, 'superbpm/config.json'), JSON.stringify({ schemaVersion: 1, environment: 'superbpm' }))
    expect(readDesktopBranding(root, 'local')).toEqual({ displayName: '金租办公', iconSet: 'hxfl', artifactNameBase: '金租办公' })
    expect(readDesktopBranding(root, 'hxfl')).toEqual({ displayName: '金租办公', iconSet: 'hxfl', artifactNameBase: '金租办公' })
    expect(readDesktopBranding(root, 'superbpm')).toEqual(resolveDesktopBranding())
  })

  it.each(['../dsh', 'Bad Set'])('rejects invalid icon set %j', (iconSet) => {
    expect(() => resolveDesktopBranding({ iconSet })).toThrow()
  })

  it('uses the DSH icon set when the selected field is blank', () => {
    expect(resolveDesktopBranding({ iconSet: '' }).iconSet).toBe('dsh')
  })

  it.each(['../outside', 'folder/name', 'a\\b', 'bad:name'])('rejects unsafe artifact filename base %j', (artifactNameBase) => {
    expect(() => resolveDesktopBranding({ artifactNameBase })).toThrow(/single safe filename/u)
  })

  it('requires a complete resource set instead of silently substituting another one', async () => {
    const root = await directory()
    await mkdir(join(root, 'incomplete/installer'), { recursive: true })
    expect(() => resolveDesktopIconSet(root, 'incomplete')).toThrow(/missing/u)
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readDesktopRuntimeRelease } from '../scripts/desktop-runtime-release.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('uses the DSH package version for runtime metadata independently of Desktop', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-runtime-release-'))
  roots.push(root)
  const repositoryRoot = join(root, 'repository')
  const desktopRoot = join(repositoryRoot, 'apps', 'desktop')
  const runtimeRoot = join(root, 'runtime')
  mkdirSync(desktopRoot, { recursive: true })
  mkdirSync(runtimeRoot)
  writeFileSync(join(repositoryRoot, 'package.json'), JSON.stringify({ version: '0.2.1-alpha.2' }))
  writeFileSync(join(desktopRoot, 'package.json'), JSON.stringify({ version: '1.0.1' }))
  writeFileSync(join(runtimeRoot, 'versions.json'), JSON.stringify({ node: '24.21.0', pnpm: '11.28.5' }))

  expect(readDesktopRuntimeRelease(repositoryRoot, runtimeRoot)).toMatchObject({
    version: '0.2.1-alpha.2',
    nodeVersion: '24.21.0',
    pnpmVersion: '11.28.5',
  })
})

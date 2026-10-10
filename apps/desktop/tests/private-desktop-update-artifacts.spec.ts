import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dump } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyPrivateDesktopUpdateArtifacts } from '../scripts/private-desktop-update-artifacts.mjs'

const roots: string[] = []
const target = { name: 'mac-arm64', platform: 'darwin', arch: 'arm64' }
const version = '1.2.3'
const base = `deepseek-harness-${version}-mac-arm64`

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'private-desktop-update-artifacts-'))
  roots.push(root)
  const bytes = Buffer.from('signed zip payload')
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  await writeFile(join(root, `${base}.zip`), bytes)
  await writeFile(join(root, `${base}.zip.blockmap`), 'blockmap')
  await writeFile(join(root, `${base}.dmg`), 'signed dmg')
  await writeFile(join(root, 'nightly-mac.yml'), dump({
    version,
    files: [{ url: `${base}.zip`, size: bytes.length, sha512 }],
  }))
  return root
}

afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('private desktop update artifact qualification', () => {
  it('records the checksum-matched macOS ZIP, blockmap, and direct-install DMG', async () => {
    const root = await fixture()
    await expect(verifyPrivateDesktopUpdateArtifacts(root, target, version)).resolves.toMatchObject({
      metadata: { filename: 'nightly-mac.yml', version },
      artifacts: [
        { kind: 'updater-payload', filename: `${base}.zip` },
        { kind: 'blockmap', filename: `${base}.zip.blockmap` },
        { kind: 'direct-installer', filename: `${base}.dmg` },
      ],
    })
  })

  it('rejects metadata whose checksum does not match the updater ZIP', async () => {
    const root = await fixture()
    await writeFile(join(root, 'nightly-mac.yml'), dump({ version, files: [{
      url: `${base}.zip`, size: 1, sha512: 'wrong',
    }] }))
    await expect(verifyPrivateDesktopUpdateArtifacts(root, target, version)).rejects.toThrow(/does not match/u)
  })

  it('validates the signed Windows EXE and NSIS blockmap against nightly.yml', async () => {
    const root = await mkdtemp(join(tmpdir(), 'private-desktop-update-win-artifacts-'))
    roots.push(root)
    const filename = `deepseek-harness-${version}-win-x64.exe`
    const bytes = Buffer.from('signed installer')
    await writeFile(join(root, filename), bytes)
    await writeFile(join(root, `${filename}.blockmap`), 'blockmap')
    await writeFile(join(root, 'nightly.yml'), dump({ version, files: [{
      url: filename, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64'),
    }] }))
    await expect(verifyPrivateDesktopUpdateArtifacts(root,
      { name: 'win-x64', platform: 'win32', arch: 'x64' }, version)).resolves.toMatchObject({
      metadata: { filename: 'nightly.yml', version },
      artifacts: [{ kind: 'updater-payload', filename }, { kind: 'blockmap', filename: `${filename}.blockmap` }],
    })
  })
})

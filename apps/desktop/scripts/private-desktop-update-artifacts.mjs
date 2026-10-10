/** Verify local updater metadata and payloads before recording a private build as complete. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`desktop updates: ${label} must be an object`)
  }
  return value
}

async function artifact(root, filename, kind) {
  const path = join(root, filename)
  const stat = statSync(path, { throwIfNoEntry: false })
  if (stat === undefined || !stat.isFile() || stat.size <= 0) {
    throw new Error(`desktop updates: missing or empty ${filename}`)
  }
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  const sha512 = hash.digest('base64')
  return { kind, filename, size: stat.size, sha512 }
}

/** Verify the selected channel file and its platform update payload before recording success.
 * @param {string} root Artifact output directory.
 * @param {{ name: string, platform: string, arch: string }} target Packaged platform target.
 * @param {string} version Version embedded in the build.
 * @returns {Promise<{ metadata: object, artifacts: object[] }>} Validated metadata and local file summaries.
 */
export async function verifyPrivateDesktopUpdateArtifacts(root, target, version) {
  const darwin = target.platform === 'darwin'
  const metadataFilename = darwin ? 'nightly-mac.yml' : 'nightly.yml'
  const extension = darwin ? 'zip' : 'exe'
  const base = `deepseek-harness-${version}-${darwin ? 'mac' : 'win'}-${target.arch}`
  const metadata = object(load(readFileSync(join(root, metadataFilename), 'utf8')), metadataFilename)
  if (metadata.version !== version || !Array.isArray(metadata.files) || metadata.files.length !== 1) {
    throw new Error(`desktop updates: ${metadataFilename} must describe exactly version ${version}`)
  }
  const info = object(metadata.files[0], `${metadataFilename}.files[0]`)
  const filename = `${base}.${extension}`
  if (info.url !== filename || !Number.isSafeInteger(info.size) || typeof info.sha512 !== 'string') {
    throw new Error(`desktop updates: ${metadataFilename} must reference ${filename} with size and SHA-512`)
  }
  const payload = await artifact(root, filename, 'updater-payload')
  if (payload.size !== info.size || payload.sha512 !== info.sha512) {
    throw new Error(`desktop updates: ${metadataFilename} does not match ${filename}`)
  }
  const artifacts = [payload, await artifact(root, `${filename}.blockmap`, 'blockmap')]
  if (darwin) artifacts.push(await artifact(root, `${base}.dmg`, 'direct-installer'))
  return { metadata: { filename: metadataFilename, version }, artifacts }
}

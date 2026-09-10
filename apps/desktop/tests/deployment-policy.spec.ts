import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DSH_DESKTOP_DEPLOYMENT_POLICY_FILE,
  OFFICIAL_DESKTOP_NPM_REGISTRY,
  readDesktopDeploymentPolicyFile,
  resolveDesktopDeploymentPolicy,
} from '../src/deployment-policy.ts'

const roots: string[] = []

function tempPolicy(value: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-policy-test-'))
  roots.push(root)
  const path = join(root, 'policy.json')
  writeFileSync(path, `${JSON.stringify(value)}\n`)
  return path
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop deployment policy', () => {
  it('uses official defaults when no policy file is configured', () => {
    expect(resolveDesktopDeploymentPolicy({})).toEqual({
      schemaVersion: 1,
      name: 'official',
      npmRegistryUrl: OFFICIAL_DESKTOP_NPM_REGISTRY,
      preinstalledBundles: [],
      allowedBuilds: {},
    })
  })

  it('validates and normalizes an enterprise policy file without credentials', () => {
    const path = tempPolicy({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'https://registry.example.com/npm/',
      updateBaseUrl: 'https://updates.example.com/releases/',
      privateMarketUrl: 'https://market.example.com/catalog.json',
      pipIndexUrl: 'https://pypi.example.com/simple/',
      defaultProfile: 'enterprise',
      preinstalledBundles: ['@scope/market', '@scope/vision', 'local-market@file:/opt/dsh/local-market-1.0.0.tgz'],
      allowedBuilds: { node_pty: true },
      allowedDomains: ['market.example.com', 'pypi.example.com', 'registry.example.com', 'updates.example.com'],
    })

    expect(readDesktopDeploymentPolicyFile(path)).toEqual({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'https://registry.example.com/npm/',
      updateBaseUrl: 'https://updates.example.com/releases/',
      privateMarketUrl: 'https://market.example.com/catalog.json',
      pipIndexUrl: 'https://pypi.example.com/simple/',
      defaultProfile: 'enterprise',
      preinstalledBundles: ['@scope/market', '@scope/vision', 'local-market@file:/opt/dsh/local-market-1.0.0.tgz'],
      allowedBuilds: { node_pty: true },
      allowedDomains: ['market.example.com', 'pypi.example.com', 'registry.example.com', 'updates.example.com'],
    })
  })

  it('rejects non-HTTPS URLs, embedded credentials, and domains outside the allowlist', () => {
    expect(() => readDesktopDeploymentPolicyFile(tempPolicy({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'http://registry.example.com/npm/',
    }))).toThrow(/must use HTTPS/u)
    expect(() => readDesktopDeploymentPolicyFile(tempPolicy({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'https://user:pass@registry.example.com/npm/',
    }))).toThrow(/must not include credentials/u)
    expect(() => readDesktopDeploymentPolicyFile(tempPolicy({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'https://registry.example.com/npm/',
      privateMarketUrl: 'https://market.example.com/catalog.json',
      allowedDomains: ['registry.example.com'],
    }))).toThrow(/outside the deployment policy allowlist/u)
  })

  it('resolves the configured policy file from the packaging environment', () => {
    const path = tempPolicy({
      schemaVersion: 1,
      name: 'enterprise',
      npmRegistryUrl: 'https://registry.example.com/npm/',
    })
    expect(resolveDesktopDeploymentPolicy({
      [DSH_DESKTOP_DEPLOYMENT_POLICY_FILE]: path,
    }).npmRegistryUrl).toBe('https://registry.example.com/npm/')
  })
})

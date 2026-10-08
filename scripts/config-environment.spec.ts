import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPrivateMarketEnvironment } from './config-environment.ts'

const roots: string[] = []

function config(value: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-config-env-'))
  roots.push(root)
  mkdirSync(join(root, 'acme'))
  writeFileSync(join(root, 'acme', 'config.json'), JSON.stringify(value))
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('private market deployment configuration', () => {
  it('reads only the selected market namespace and hashes normalized non-secret fields', () => {
    const root = config({
      schemaVersion: 1,
      environment: 'acme',
      plugins: { privateMarket: {
        catalogUrl: 'https://market.example/catalog.json',
        catalogCredentialRef: 'MARKET_TOKEN',
        registryUrl: 'https://npm.example/',
      } },
      desktop: { updateUrl: 'https://updates.example/' },
      other: { secret: 'not-consumed' },
    })
    const first = readPrivateMarketEnvironment(root, 'acme')
    expect(first).toMatchObject({
      environment: 'acme',
      catalogUrl: 'https://market.example/catalog.json',
      catalogCredentialRef: 'MARKET_TOKEN',
      registryUrl: 'https://npm.example/',
    })
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(first)).not.toContain('not-consumed')
    expect(JSON.stringify(first)).not.toContain('updates.example')
    expect(JSON.stringify(first)).not.toContain('secret')
  })

  it('rejects path selectors, mismatched environment, unknown market fields, and non-HTTPS URLs', () => {
    const valid = { schemaVersion: 1, environment: 'acme', plugins: { privateMarket: {
      catalogUrl: 'https://market.example/catalog.json', registryUrl: 'https://npm.example/',
    } } }
    const root = config(valid)
    expect(() => readPrivateMarketEnvironment(root, '../acme')).toThrow(/invalid environment/u)
    const otherRoot = config({ ...valid, environment: 'acme' })
    mkdirSync(join(otherRoot, 'other'))
    writeFileSync(join(otherRoot, 'other', 'config.json'), JSON.stringify(valid))
    expect(() => readPrivateMarketEnvironment(otherRoot, 'other')).toThrow(/environment name/u)
    const invalid = (market: Record<string, unknown>): string => config({ ...valid, plugins: { privateMarket: market } })
    expect(() => readPrivateMarketEnvironment(invalid({ ...valid.plugins.privateMarket, token: 'secret' }), 'acme'))
      .toThrow(/unsupported plugins.privateMarket field/u)
    expect(() => readPrivateMarketEnvironment(invalid({ catalogUrl: 'http://market.example', registryUrl: 'https://npm.example/' }), 'acme'))
      .toThrow(/HTTPS URL/u)
  })

  it('requires the external config root and a credential reference name', () => {
    expect(() => readPrivateMarketEnvironment(undefined, 'acme')).toThrow(/DSH_CONFIG_ENV_DIR/u)
    const root = config({ schemaVersion: 1, environment: 'acme', plugins: { privateMarket: {
      catalogUrl: 'https://market.example/catalog.json', catalogCredentialRef: 'bad-token', registryUrl: 'https://npm.example/',
    } } })
    expect(() => readPrivateMarketEnvironment(root, 'acme')).toThrow(/CredentialRef/u)
  })

  it('requires opaque product and plugin namespaces to be JSON objects', () => {
    const validMarket = { catalogUrl: 'https://market.example/catalog.json', registryUrl: 'https://npm.example/' }
    const invalidProduct = config({ schemaVersion: 1, environment: 'acme', plugins: { privateMarket: validMarket }, desktop: [] })
    expect(() => readPrivateMarketEnvironment(invalidProduct, 'acme')).toThrow(/product namespace desktop/u)
    const invalidPlugin = config({ schemaVersion: 1, environment: 'acme', plugins: { privateMarket: validMarket, other: null } })
    expect(() => readPrivateMarketEnvironment(invalidPlugin, 'acme')).toThrow(/plugin namespace other/u)
  })
})

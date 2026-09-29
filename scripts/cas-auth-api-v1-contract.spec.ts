import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'

type OpenApiDocument = {
  openapi?: unknown
  info?: { version?: unknown }
  paths?: Record<string, Record<string, unknown>>
  components?: { schemas?: Record<string, { properties?: Record<string, unknown>; required?: unknown }> }
}

function protocol(): OpenApiDocument {
  return load(readFileSync(new URL('../openspec/changes/add-private-desktop-cas-login/api-v1.openapi.yaml', import.meta.url), 'utf8')) as OpenApiDocument
}

it('defines the six versioned Host endpoints without exposing enterprise authorization or model credentials', () => {
  const document = protocol()

  expect(document.openapi).toBe('3.1.0')
  expect(document.info?.version).toBe('1.0.0')
  expect(Object.keys(document.paths ?? {}).sort()).toEqual([
    '/api/v1/login-requests',
    '/api/v1/login-requests/{request_id}/cancel',
    '/api/v1/login-requests/{request_id}/exchange',
    '/api/v1/login-requests/{request_id}/status',
    '/api/v1/logout',
    '/api/v1/me',
  ])
  expect(Object.keys(document.paths?.['/api/v1/login-requests'] ?? {}).sort()).toEqual(['post'])
  expect(Object.keys(document.paths?.['/api/v1/login-requests/{request_id}/status'] ?? {}).sort()).toEqual(['post'])
  expect(Object.keys(document.paths?.['/api/v1/login-requests/{request_id}/cancel'] ?? {}).sort()).toEqual(['post'])
  expect(Object.keys(document.paths?.['/api/v1/login-requests/{request_id}/exchange'] ?? {}).sort()).toEqual(['post'])
  expect(Object.keys(document.paths?.['/api/v1/me'] ?? {}).sort()).toEqual(['get'])
  expect(Object.keys(document.paths?.['/api/v1/logout'] ?? {}).sort()).toEqual(['post'])

  const user = document.components?.schemas?.User
  expect(user?.required).toEqual(['enterprise_id', 'issuer', 'subject'])
  expect(Object.keys(user?.properties ?? {})).not.toContain('permissions')
  expect(Object.keys(user?.properties ?? {})).not.toContain('quota')
  expect(Object.keys(user?.properties ?? {})).not.toContain('model_api_key')
})

it('defines proof-bound retries, terminal states, and one-time token delivery samples', () => {
  const document = protocol()
  const schemas = document.components?.schemas ?? {}

  expect(schemas.LoginRequest?.required).toEqual([
    'enterprise_id', 'app_id', 'device_id', 'request_id', 'challenge', 'challenge_method', 'device_description',
  ])
  expect(schemas.Proof?.required).toEqual(['verifier'])
  expect(schemas.LoginStatus?.properties?.status).toBeDefined()
  expect(schemas.Exchange?.properties?.access_token).toBeDefined()
  expect(schemas.Error?.required).toEqual(['code', 'message'])
})

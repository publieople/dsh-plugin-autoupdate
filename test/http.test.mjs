import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { hostNameOf, isTrustedHost, readJsonBody, createRouteHandlers, sendJson, ROUTE_BASE } from '../lib/http.js'

function fakeRes () {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead (status, headers) { this.statusCode = status; this.headers = headers || {}; return this },
    end (chunk) { if (chunk !== undefined) this.body += chunk },
    json () { return JSON.parse(this.body) },
  }
}

function fakeReq ({ method = 'GET', url = '/', host = '127.0.0.1:19387', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  req.method = method
  req.url = url
  req.headers = host === null ? {} : { host }
  return req
}

test('hostNameOf strips ports and keeps IPv6 brackets', () => {
  assert.equal(hostNameOf('127.0.0.1:19387'), '127.0.0.1')
  assert.equal(hostNameOf('LocalHost'), 'localhost')
  assert.equal(hostNameOf('[::1]:8080'), '[::1]')
  assert.equal(hostNameOf(''), '')
})

test('only loopback or an explicitly declared authority is trusted', () => {
  assert.equal(isTrustedHost('127.0.0.1:1'), true)
  assert.equal(isTrustedHost('localhost'), true)
  assert.equal(isTrustedHost('[::1]:2'), true)
  assert.equal(isTrustedHost('evil.example'), false)
  assert.equal(isTrustedHost(undefined), false)
  assert.equal(isTrustedHost('dsh.internal:8080', ['dsh.internal:9999']), true)
  assert.equal(isTrustedHost('other.internal', ['dsh.internal']), false)
})

test('readJsonBody parses JSON, tolerates empty bodies and rejects oversized ones', async () => {
  assert.deepEqual(await readJsonBody(fakeReq({ body: '{"a":1}' })), { a: 1 })
  assert.deepEqual(await readJsonBody(fakeReq({})), {})
  await assert.rejects(() => readJsonBody(fakeReq({ body: 'x'.repeat(100) }), 10), /too large/)
  await assert.rejects(() => readJsonBody(fakeReq({ body: 'not json' })), /invalid JSON/)
})

const CLI = {
  cli: 'dsh',
  home: '/tmp/dsh',
  profileDirOf: (h, p) => h + '/profiles/' + p,
  resolve: (requested) => {
    const wanted = String(requested || '').split(',').map((s) => s.trim()).filter(Boolean)
    const profiles = wanted.length > 0 ? wanted : ['m1test']
    return { profiles, unknown: [], all: ['m1test'] }
  },
}

test('GET status reports what the checker returned', async () => {
  const handlers = createRouteHandlers({ ...CLI, check: async (profile) => ({ profile, rows: [{ name: 'p', current: '1.0.0', latest: '1.1.0' }] }) })
  const res = fakeRes()
  await handlers.status(fakeReq({ url: ROUTE_BASE + '/status' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  const payload = res.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.reports[0].rows[0].latest, '1.1.0')
})

test('status refuses other methods with 405 and an Allow header', async () => {
  const handlers = createRouteHandlers(CLI)
  const res = fakeRes()
  await handlers.status(fakeReq({ method: 'POST' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})

test('mutating routes refuse an untrusted Host before reading the body', async () => {
  const handlers = createRouteHandlers(CLI)
  const res = fakeRes()
  await handlers.apply(fakeReq({ method: 'POST', host: 'evil.example', body: '{"confirm":true}' }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().reason, 'untrusted host')
})

test('apply refuses to write without an explicit confirm', async () => {
  let called = false
  const handlers = createRouteHandlers({ ...CLI, apply: async () => { called = true; return {} } })
  const res = fakeRes()
  await handlers.apply(fakeReq({ method: 'POST', body: '{}' }), res)
  assert.equal(res.statusCode, 400)
  assert.match(res.json().reason, /confirm/)
  assert.equal(called, false)
})

test('apply passes latest through and reports the restart requirement', async () => {
  const seen = []
  const handlers = createRouteHandlers({
    ...CLI,
    apply: async (args) => { seen.push(args); return { profile: args.profile, code: 0, changed: ['dsh-x: 1.0.0 -> 1.1.0'] } },
  })
  const res = fakeRes()
  await handlers.apply(fakeReq({ method: 'POST', body: '{"confirm":true,"latest":true,"profiles":"m1test"}' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].latest, true)
  assert.equal(seen[0].profile, 'm1test')
  assert.equal(res.json().restartRequired, true)
})

test('rollback aggregates ok across profiles', async () => {
  const handlers = createRouteHandlers({ ...CLI, rollback: async (args) => ({ profile: args.profile, ok: args.profile === 'm1test' }) })
  const res = fakeRes()
  await handlers.rollback(fakeReq({ method: 'POST', body: '{"profiles":"m1test"}' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
})

test('sendJson writes a no-store JSON response', () => {
  const res = fakeRes()
  sendJson(res, 201, { ok: true })
  assert.equal(res.statusCode, 201)
  assert.match(res.headers['content-type'], /application\/json/)
  assert.deepEqual(res.json(), { ok: true })
})

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

test('status advertises the routes it registered, so a stale host is detectable', async () => {
  const handlers = createRouteHandlers(CLI)
  const res = fakeRes()
  await handlers.status(fakeReq({}), res)
  const payload = res.json()
  // The browser bundle is re-read from disk on every page load, the host half is
  // only loaded at process start - so a page refresh can show tabs whose routes
  // the running host does not have (that is how 发现 404ed on 2026-10-09). The
  // page compares this list instead of rendering an empty catalog.
  assert.deepEqual(payload.features, ['status', 'apply', 'rollback', 'restart', 'catalog', 'install', 'lock', 'unlock'])
  assert.equal(typeof payload.version, 'string')
  assert.match(payload.version, /^\d+\.\d+\.\d+/)
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

test('restart refuses a forged Host and a missing confirm', async () => {
  const handlers = createRouteHandlers({ ...CLI, desktop: true })
  const forged = fakeRes()
  await handlers.restart(fakeReq({ method: 'POST', host: 'evil.example', body: '{"confirm":true}' }), forged)
  assert.equal(forged.statusCode, 403)
  const unconfirmed = fakeRes()
  await handlers.restart(fakeReq({ method: 'POST', body: '{}' }), unconfirmed)
  assert.equal(unconfirmed.statusCode, 400)
})

test('restart is refused with a reason where the shell owns the lifecycle', async () => {
  let called = false
  const handlers = createRouteHandlers({ ...CLI, desktop: true, scheduleRestart: () => { called = true; return { mode: 'supervisor' } } })
  const res = fakeRes()
  await handlers.restart(fakeReq({ method: 'POST', body: '{"confirm":true}' }), res)
  assert.equal(res.statusCode, 409)
  assert.match(res.json().reason, /Desktop|tray/i)
  assert.equal(called, false)
})

test('restart schedules on a host that supports it, and reports the mode', async () => {
  const seen = []
  const handlers = createRouteHandlers({
    ...CLI,
    desktop: false,
    port: 65535,
    scheduleRestart: (options) => { seen.push(options); return { mode: 'helper', helper: '/tmp/x.mjs', exit: () => {} } },
  })
  const res = fakeRes()
  await handlers.restart(fakeReq({ method: 'POST', body: '{"confirm":true}' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
  assert.equal(res.json().mode, 'helper')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].port, 65535)
})

test('status advertises the restart capability', async () => {
  const handlers = createRouteHandlers({ ...CLI, desktop: true, check: async (profile) => ({ profile, rows: [] }) })
  const res = fakeRes()
  await handlers.status(fakeReq({}), res)
  assert.equal(res.json().restart.supported, false)
})

const CATALOG = {
  categories: { dev: { en: 'Development', zh: '开发' } },
  plugins: [{ name: 'dsh-known', npm: 'dsh-known', owner: 'x', category: 'dev', description: { en: 'Known', zh: '已知' }, stars: 3, downloads: 9 }],
}

test('catalog is read-only and serves rows plus categories', async () => {
  const handlers = createRouteHandlers({ ...CLI, catalogOf: async () => ({ catalog: CATALOG, fetchedAt: 1, cached: true }) })
  const ok = fakeRes()
  await handlers.catalog(fakeReq({ url: ROUTE_BASE + '/catalog?q=known' }), ok)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().rows[0].name, 'dsh-known')
  assert.equal(ok.json().categories[0].id, 'dev')
  const wrong = fakeRes()
  await handlers.catalog(fakeReq({ method: 'POST' }), wrong)
  assert.equal(wrong.statusCode, 405)
})

test('install is fenced, confirmed and catalog-limited', async () => {
  const installed = []
  const handlers = createRouteHandlers({
    ...CLI,
    catalogOf: async () => ({ catalog: CATALOG, fetchedAt: 1 }),
    installPackage: async (args) => { installed.push(args); return { code: 0 } },
  })
  const forged = fakeRes()
  await handlers.install(fakeReq({ method: 'POST', host: 'evil.example', body: '{"confirm":true,"spec":"dsh-known"}' }), forged)
  assert.equal(forged.statusCode, 403)
  const unconfirmed = fakeRes()
  await handlers.install(fakeReq({ method: 'POST', body: '{"spec":"dsh-known"}' }), unconfirmed)
  assert.equal(unconfirmed.statusCode, 400)
  const unknown = fakeRes()
  await handlers.install(fakeReq({ method: 'POST', body: '{"confirm":true,"spec":"dsh-evil"}' }), unknown)
  assert.equal(unknown.statusCode, 400)
  assert.match(unknown.json().reason, /not in the catalog/)
  const pinned = fakeRes()
  await handlers.install(fakeReq({ method: 'POST', body: '{"confirm":true,"spec":"dsh-known@1.0.0"}' }), pinned)
  assert.equal(pinned.statusCode, 400, 'a pinned spec is never accepted')
  const ok = fakeRes()
  await handlers.install(fakeReq({ method: 'POST', body: '{"confirm":true,"spec":"dsh-known"}' }), ok)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().spec, 'dsh-known')
  assert.equal(ok.json().restartRequired, true)
  assert.equal(installed.length, 1)
  assert.equal(installed[0].profile, 'm1test')
})

test('lock and unlock write only our own state, behind the host fence', async () => {
  const calls = []
  const handlers = createRouteHandlers({
    ...CLI,
    lockPackage: (dir, entry) => { calls.push(['lock', dir, entry]); return [entry] },
    unlockPackage: (dir, name) => { calls.push(['unlock', dir, name]); return [] },
  })
  const forged = fakeRes()
  await handlers.lock(fakeReq({ method: 'POST', host: 'evil.example', body: '{"name":"x"}' }), forged)
  assert.equal(forged.statusCode, 403)
  const nameless = fakeRes()
  await handlers.lock(fakeReq({ method: 'POST', body: '{}' }), nameless)
  assert.equal(nameless.statusCode, 400)
  const locked = fakeRes()
  await handlers.lock(fakeReq({ method: 'POST', body: '{"name":"dsh-known","version":"1.0.0"}' }), locked)
  assert.equal(locked.statusCode, 200)
  assert.equal(calls[0][0], 'lock')
  assert.equal(calls[0][2].name, 'dsh-known')
  const unlocked = fakeRes()
  await handlers.unlock(fakeReq({ method: 'POST', body: '{"name":"dsh-known"}' }), unlocked)
  assert.equal(unlocked.statusCode, 200)
  assert.equal(calls[1][0], 'unlock')
  assert.equal(calls[1][2], 'dsh-known')
})

test('status splits locked rows out of the offer', async () => {
  const handlers = createRouteHandlers({
    ...CLI,
    check: async (profile) => ({ profile, rows: [{ name: 'a', current: '1', latest: '2' }, { name: 'b', current: '1', latest: '2' }] }),
    locksOf: () => [{ name: 'a' }],
  })
  const res = fakeRes()
  await handlers.status(fakeReq({}), res)
  const report = res.json().reports[0]
  assert.deepEqual(report.rows.map((r) => r.name), ['b'])
  assert.deepEqual(report.lockedRows.map((r) => r.name), ['a'])
})

test('sendJson writes a no-store JSON response', () => {
  const res = fakeRes()
  sendJson(res, 201, { ok: true })
  assert.equal(res.statusCode, 201)
  assert.match(res.headers['content-type'], /application\/json/)
  assert.deepEqual(res.json(), { ok: true })
})

/**
 * Host HTTP surface for the settings page.
 *
 * Three exact routes on the bare webServer, mirroring how dsh-market does it. Why
 * 'bare exact' matters: DSH's own /api fence is a PREFIX route that performs the
 * Host/origin trust check, and exact registrations win over prefixes - so our
 * handlers never pass through that fence and have to decide for themselves.
 *
 * The rule applied here, and the reason for it: Host is the one header a
 * rebinding attacker cannot forge, so a mutating route accepts only loopback or an
 * authority the operator declared. Reads stay open, exactly as the market's did
 * after #729 - fencing reads breaks every deployment reached by a name while
 * protecting nothing that matters (the payload is version numbers).
 */
import { readFileSync } from 'node:fs'
import { dshHome, resolveProfiles } from './profiles.js'
import { findDshCli } from './dsh-cli.js'
import { checkProfile } from './outdated.js'
import { readDeps } from './apply.js'
import { applyUpdate, rollback } from './apply.js'
import { restartCapability, scheduleRestart } from './restart.js'
import { catalogCategories, catalogRows, fetchCatalog, findCatalogSpec, installSpecFor } from './catalog.js'
import { listLocks, lockPackage, splitLocked, unlockPackage } from './state.js'
import { runCli } from './outdated.js'

export const ROUTE_BASE = '/plugin-autoupdate'
const MAX_BODY_BYTES = 64 * 1024

/**
 * Every route this build registers. The page compares this list against its own
 * expectations, because the two halves of a plugin do not reload together: the
 * browser bundle is re-read from disk on every page load, the host half only when
 * the process starts. That is exactly how 发现 ended up 404ing on 2026-10-09
 * behind a new tab - reporting the list turns a blank page into a diagnosis.
 */
export const ROUTE_FEATURES = ['status', 'apply', 'rollback', 'restart', 'catalog', 'install', 'lock', 'unlock']

let cachedVersion
/** This package's version, so the page can name the host build it is talking to. */
export function pluginVersion () {
  if (cachedVersion === undefined) {
    try { cachedVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || null } catch { cachedVersion = null }
  }
  return cachedVersion
}

export function sendJson (response, status, payload) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

/** Collect at most MAX_BODY_BYTES of the request body and parse it as JSON. */
export function readJsonBody (request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { reject(new Error('body too large')); request.destroy?.(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(text)) } catch (err) { reject(new Error('invalid JSON body')) }
    })
    request.on('error', reject)
  })
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', '0.0.0.0'])

/** Host header -> hostname, tolerating IPv6 brackets and a missing port. */
export function hostNameOf (hostHeader) {
  const value = String(hostHeader || '').trim().toLowerCase()
  if (value === '') return ''
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value : value.slice(0, end + 1)
  }
  return value.split(':')[0]
}

export function isTrustedHost (hostHeader, trustedHosts = []) {
  const name = hostNameOf(hostHeader)
  if (name === '') return false
  if (LOOPBACK.has(name)) return true
  return trustedHosts.some((entry) => hostNameOf(entry) === name)
}

function envTrustedHosts (env = process.env) {
  return String(env.PLUGIN_AUTOUPDATE_TRUSTED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function sendError (response, status, reason, extra) {
  sendJson(response, status, { ok: false, reason, ...(extra || {}) })
}

/** Where a dependency came from, from its recorded specifier. */
export function sourceOf (spec) {
  const value = String(spec || '')
  if (value.startsWith('github:') || value.startsWith('git+') || value.startsWith('git@')) return 'github'
  if (value.startsWith('link:') || value.startsWith('file:') || value.startsWith('.') || /^[A-Za-z]:[\\/]/.test(value)) return 'local'
  if (value.startsWith('workspace:')) return 'workspace'
  return 'npm'
}

function installedOf (profileDir, deps) {
  return Object.keys(deps).sort().map((name) => ({ name, spec: deps[name], source: sourceOf(deps[name]) }))
}

async function profileReports (profiles, fn) {
  const reports = []
  for (const profile of profiles) reports.push(await fn(profile))
  return reports
}

/**
 * Handlers with injectable collaborators so the HTTP contract is unit-testable
 * without a CLI, a profile, or a socket.
 */
export function createRouteHandlers (options = {}) {
  const cli = options.cli || findDshCli()
  const home = options.home || dshHome()
  const trustedHosts = options.trustedHosts || envTrustedHosts()
  const check = options.check || ((profile) => checkProfile({ cli, profile }))
  const apply = options.apply || ((args) => applyUpdate({ ...args, cli }))
  const rollbackFn = options.rollback || ((args) => rollback({ ...args, cli }))
  const profileDirOf = options.profileDirOf || ((homeDir, profile) => [homeDir, 'profiles', profile].join(process.platform === 'win32' ? '\\' : '/'))
  // The official Desktop shell owns its own process lifecycle; ask the injecting
  // context whether it published that service rather than guessing from a name.
  const desktopOf = typeof options.desktop === 'function' ? options.desktop : () => options.desktop === true
  const portOf = typeof options.port === 'function' ? options.port : () => options.port
  const schedule = options.scheduleRestart || scheduleRestart
  const locksOf = options.locksOf || ((profileDir) => listLocks(profileDir))
  const lockFn = options.lockPackage || lockPackage
  const unlockFn = options.unlockPackage || unlockPackage
  const catalogOf = options.catalogOf || (() => fetchCatalog({ home }))
  const installPackage = options.installPackage || ((args) => runCli(cli, ['plugin', '--profile', args.profile, 'add', args.spec], { timeoutMs: 600000 }))

  // Injectable like the rest, so the HTTP contract is testable without a DSH home.
  const hint = typeof options.profileHint === 'function' ? options.profileHint : () => options.profileHint
  const resolve = options.resolve || ((requested) => resolveProfiles(requested, process.env, home, hint()))

  return {
    /** GET: what the resolver offers, per profile. Read-only, deliberately unfenced. */
    status: async (request, response) => {
      if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return }
      const resolved = resolve(new URL(request.url || '/', 'http://localhost').searchParams.get('profiles'))
      try {
        const reports = await profileReports(resolved.profiles, async (profile) => {
          const dir = profileDirOf(home, profile)
          // Locked packages leave the offer but stay visible in lockedRows: a lock
          // suppresses an update, it does not hide that one exists.
          const report = splitLocked(await check(profile), locksOf(dir))
          return { ...report, installed: installedOf(dir, readDeps(dir)) }
        })
        sendJson(response, 200, { ok: true, profiles: resolved.profiles, defaulted: resolved.defaulted, unknownProfiles: resolved.unknown, knownProfiles: resolved.all, features: ROUTE_FEATURES, version: pluginVersion(), restart: restartCapability({ desktop: desktopOf() }), reports })
      } catch (err) {
        sendError(response, 500, String((err && err.message) || err))
      }
    },

    /** POST { profiles?, latest?, confirm: true }: snapshot, then update. Fenced. */
    apply: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      if (body.confirm !== true) { sendError(response, 400, 'confirm: true is required - this writes to the profile'); return }
      const resolved = resolve(body.profiles)
      if (resolved.profiles.length === 0) { sendError(response, 400, 'no profile resolved', { knownProfiles: resolved.all, unknownProfiles: resolved.unknown }); return }
      try {
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
        const reports = []
        for (const profile of resolved.profiles) {
          reports.push(await apply({ profile, profileDir: profileDirOf(home, profile), latest: body.latest === true, stamp }))
        }
        sendJson(response, 200, { ok: true, restartRequired: true, profiles: resolved.profiles, reports })
      } catch (err) {
        sendError(response, 500, String((err && err.message) || err))
      }
    },

    /** GET ?q=&category=&limit= : the Discover view's catalog. Read-only, unfenced like status. */
    catalog: async (request, response) => {
      if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return }
      const url = new URL(request.url || '/', 'http://localhost')
      try {
        const result = await catalogOf()
        const found = catalogRows(result.catalog, {
          q: url.searchParams.get('q') || '',
          category: url.searchParams.get('category') || '',
          limit: Number(url.searchParams.get('limit')) || 40,
        })
        sendJson(response, 200, {
          ok: true,
          total: found.total,
          rows: found.rows,
          categories: catalogCategories(result.catalog),
          updated: (result.catalog && result.catalog.updated) || null,
          fetchedAt: result.fetchedAt,
          cached: Boolean(result.cached),
          stale: Boolean(result.stale),
          error: result.error || null,
        })
      } catch (err) {
        sendError(response, 502, 'catalog unavailable: ' + String((err && err.message) || err))
      }
    },

    /** POST { confirm, spec, profiles }: install one catalog package. Fenced + confirmed. */
    install: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      if (body.confirm !== true) { sendError(response, 400, 'confirm: true is required - this installs code'); return }
      // Only what the catalog lists may be installed, and never with a version:
      // `add pkg@x` is the one form that writes minimumReleaseAgeExclude.
      let entry
      try {
        const result = await catalogOf()
        entry = findCatalogSpec(result.catalog, body.spec)
      } catch (err) { sendError(response, 502, 'catalog unavailable: ' + String((err && err.message) || err)); return }
      if (entry === null) { sendError(response, 400, 'not in the catalog: ' + String(body.spec || '')); return }
      const spec = installSpecFor(entry)
      if (spec === null) { sendError(response, 400, 'catalog entry has no installable npm name'); return }
      const resolved = resolve(body.profiles)
      if (resolved.profiles.length === 0) { sendError(response, 400, 'no profile resolved', { knownProfiles: resolved.all }); return }
      try {
        const results = []
        for (const profile of resolved.profiles) results.push(await installPackage({ profile, spec }))
        sendJson(response, 200, { ok: results.every((item) => item.code === 0), spec, entry, restartRequired: true, profiles: resolved.profiles, results })
      } catch (err) {
        sendError(response, 500, String((err && err.message) || err))
      }
    },

    /** POST { profiles, name, version?, note? }: stop offering updates. Fenced, reversible. */
    lock: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      if (typeof body.name !== 'string' || body.name.trim() === '') { sendError(response, 400, 'name is required'); return }
      const resolved = resolve(body.profiles)
      if (resolved.profiles.length === 0) { sendError(response, 400, 'no profile resolved', { knownProfiles: resolved.all }); return }
      try {
        const locks = {}
        for (const profile of resolved.profiles) {
          locks[profile] = lockFn(profileDirOf(home, profile), { name: body.name.trim(), version: body.version, note: body.note })
        }
        sendJson(response, 200, { ok: true, profiles: resolved.profiles, locks })
      } catch (err) { sendError(response, 500, String((err && err.message) || err)) }
    },

    /** POST { profiles, name }: offer updates again. Fenced, reversible. */
    unlock: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      if (typeof body.name !== 'string' || body.name.trim() === '') { sendError(response, 400, 'name is required'); return }
      const resolved = resolve(body.profiles)
      if (resolved.profiles.length === 0) { sendError(response, 400, 'no profile resolved', { knownProfiles: resolved.all }); return }
      try {
        const locks = {}
        for (const profile of resolved.profiles) locks[profile] = unlockFn(profileDirOf(home, profile), body.name.trim())
        sendJson(response, 200, { ok: true, profiles: resolved.profiles, locks })
      } catch (err) { sendError(response, 500, String((err && err.message) || err)) }
    },

    /** POST { confirm: true }: restart the host where the host supports it. Fenced. */
    restart: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      if (body.confirm !== true) { sendError(response, 400, 'confirm: true is required - this stops the host'); return }
      const capability = restartCapability({ desktop: desktopOf() })
      if (!capability.supported) { sendError(response, 409, capability.reason); return }
      const scheduled = schedule({ port: portOf(), supervisor: capability.supervisor })
      if (scheduled.mode === 'failed') { sendError(response, 500, scheduled.reason); return }
      sendJson(response, 200, { ok: true, mode: scheduled.mode, supervisor: scheduled.supervisor || null, helper: scheduled.helper })
      // Answer first: the helper is already detached and waiting for this port.
      setTimeout(() => { try { scheduled.exit() } catch {} }, 250)
    },

    /** POST { profiles?, snapshot? }: restore the newest (or named) snapshot. Fenced. */
    rollback: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
      if (!isTrustedHost(request.headers && request.headers.host, trustedHosts)) {
        sendError(response, 403, 'untrusted host', { hint: 'set PLUGIN_AUTOUPDATE_TRUSTED_HOSTS to allow this authority' })
        return
      }
      let body
      try { body = await readJsonBody(request) } catch (err) { sendError(response, 400, String(err.message)); return }
      const resolved = resolve(body.profiles)
      if (resolved.profiles.length === 0) { sendError(response, 400, 'no profile resolved', { knownProfiles: resolved.all, unknownProfiles: resolved.unknown }); return }
      try {
        const reports = []
        for (const profile of resolved.profiles) {
          reports.push(await rollbackFn({ profile, profileDir: profileDirOf(home, profile), snapshot: body.snapshot }))
        }
        sendJson(response, 200, { ok: reports.every((r) => r.ok), restartRequired: true, profiles: resolved.profiles, reports })
      } catch (err) {
        sendError(response, 500, String((err && err.message) || err))
      }
    },
  }
}

/**
 * Register the three routes. Returns one disposer, so the caller can hand it
 * straight to ctx.effect - the same shape dsh-market uses.
 */
export function registerRoutes (webServer, options = {}) {
  const handlers = createRouteHandlers(options)
  const disposers = [
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/status', handler: handlers.status }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/apply', handler: handlers.apply }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/rollback', handler: handlers.rollback }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/restart', handler: handlers.restart }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/catalog', handler: handlers.catalog }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/install', handler: handlers.install }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/lock', handler: handlers.lock }),
    webServer.register({ kind: 'exact', path: ROUTE_BASE + '/unlock', handler: handlers.unlock }),
  ]
  return () => { for (const dispose of disposers) dispose() }
}

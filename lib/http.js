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
import { dshHome, resolveProfiles } from './profiles.js'
import { findDshCli } from './dsh-cli.js'
import { checkProfile } from './outdated.js'
import { readDeps } from './apply.js'
import { applyUpdate, rollback } from './apply.js'

export const ROUTE_BASE = '/plugin-autoupdate'
const MAX_BODY_BYTES = 64 * 1024

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
          const report = await check(profile)
          return { ...report, installed: installedOf(profileDirOf(home, profile), readDeps(profileDirOf(home, profile))) }
        })
        sendJson(response, 200, { ok: true, profiles: resolved.profiles, defaulted: resolved.defaulted, unknownProfiles: resolved.unknown, knownProfiles: resolved.all, reports })
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
  ]
  return () => { for (const dispose of disposers) dispose() }
}

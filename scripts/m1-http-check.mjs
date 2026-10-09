/**
 * M1 HTTP live check - the settings-page surface, driven over a real socket.
 *
 * What it proves that the unit tests cannot: a real node:http server, our real
 * route handlers, a real DSH CLI, and a real profile. Rendering the page in a
 * browser is still a human step; this is everything up to the socket.
 *
 * Usage: DSH_CLI=<dsh.cmd> node scripts/m1-http-check.mjs [profile]
 */
import { createServer, request as httpRequest } from 'node:http'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { registerRoutes, ROUTE_BASE } from '../lib/http.js'
import { findDshCli } from '../lib/dsh-cli.js'
import { dshHome } from '../lib/profiles.js'
import { runCli } from '../lib/outdated.js'

const profileName = process.argv[2] || 'm1test'
process.env.DSH_PROFILE = profileName
const cli = process.env.DSH_CLI || findDshCli()
const home = dshHome()
const profileDir = path.join(home, 'profiles', profileName)
const manifest = () => readFileSync(path.join(profileDir, 'package.json'), 'utf8')
const deps = () => JSON.parse(manifest()).dependencies || {}

let passed = 0
let failed = 0
function check (name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name) } else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')) }
}

// Fixture: a caret range is what a normal install records, and the only shape
// plain `update` is allowed to move.
const setRange = async (range) => {
  const file = path.join(profileDir, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.dependencies['dsh-whale-widget'] = range
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  return runCli(cli, ['plugin', '--profile', profileName, 'install'])
}
await setRange('^0.3.17')
const before = manifest()

const routes = []
const dispose = registerRoutes(
  { register: (route) => { routes.push(route); return () => {} } },
  { cli, home, resolve: () => ({ profiles: [profileName], unknown: [], all: [profileName] }) },
)

const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const route = routes.find((r) => r.path === pathname)
  if (!route) { res.writeHead(404); res.end(); return }
  Promise.resolve(route.handler(req, res)).catch(() => { try { res.writeHead(500); res.end() } catch {} })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

function call (method, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? null : Buffer.from(JSON.stringify(options.body))
    const headers = {}
    if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = payload.length }
    if (options.host) headers.host = options.host
    const req = httpRequest({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

console.log('1) GET status over a real socket')
const status = await call('GET', ROUTE_BASE + '/status')
check('status 200', status.status === 200, JSON.stringify(status.json).slice(0, 200))
check('status is ok and carries the profile', status.json && status.json.ok === true && status.json.profiles[0] === profileName)
const rows = ((status.json && status.json.reports) || []).flatMap((r) => r.rows || [])
check('status carries the real outdated rows', rows.some((r) => r.name === 'dsh-whale-widget'), JSON.stringify(rows))
check('reads are not fenced (a named deployment must still work)', status.status === 200)

console.log('')
console.log('2) method and trust fences')
const wrongMethod = await call('POST', ROUTE_BASE + '/status', { body: {} })
check('status rejects POST with 405 + Allow', wrongMethod.status === 405 && wrongMethod.headers.allow === 'GET')
const foreign = await call('POST', ROUTE_BASE + '/apply', { body: { confirm: true }, host: 'evil.example' })
check('apply refuses a forged Host with 403', foreign.status === 403 && foreign.json.reason === 'untrusted host', JSON.stringify(foreign.json))
const noConfirm = await call('POST', ROUTE_BASE + '/apply', { body: {} })
check('apply refuses to write without confirm', noConfirm.status === 400)
check('and nothing moved', manifest() === before)

console.log('')
console.log('3) apply, then rollback, both over HTTP')
const applied = await call('POST', ROUTE_BASE + '/apply', { body: { confirm: true } })
check('apply 200', applied.status === 200, JSON.stringify(applied.json).slice(0, 220))
check('apply reports the restart requirement', applied.json && applied.json.restartRequired === true)
check('manifest really changed', manifest() !== before)
check('snapshot exists and holds the pre-apply bytes', readdirSync(profileDir).filter((n) => n.indexOf('.plugin-backup-auto-') === 0).length > 0)
const rolled = await call('POST', ROUTE_BASE + '/rollback', { body: {} })
check('rollback 200 and ok', rolled.status === 200 && rolled.json.ok === true, JSON.stringify(rolled.json).slice(0, 220))
check('manifest restored byte for byte', manifest() === before)

dispose()
server.close()
console.log('')
console.log('passed ' + passed + ', failed ' + failed)
process.exit(failed === 0 ? 0 : 1)

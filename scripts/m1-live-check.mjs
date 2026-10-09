/**
 * M1 live check - drives the REAL tool definition against a throwaway profile.
 *
 * Not a unit test: it needs a real DSH installation, the dsh CLI and a disposable
 * profile that already has this plugin installed plus at least one updatable
 * dependency. It lives in scripts/ and not test/, so `node --test` and CI never pick
 * it up.
 *
 * Usage:
 *   DSH_CLI=<path to dsh.cmd> node scripts/m1-live-check.mjs [profile]
 *
 * What it covers, in order:
 *   0. the tool contract as defineTool normalises it
 *   1. check on a caret-ranged dependency
 *   2. apply  -> manifest moves, snapshot is byte-identical to the pre-apply manifest
 *   3. rollback -> manifest restored byte for byte
 *   4. a deliberately exact-pinned dependency: plain apply must NOT move it (pnpm is
 *      right), must report what the resolver offers, and latest=true must move it
 *   5. failure paths
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as plugin from '../lib/index.js'
import { dshHome } from '../lib/profiles.js'
import { runCli } from '../lib/outdated.js'

const profileName = process.argv[2] || 'm1test'
process.env.DSH_PROFILE = profileName
const cli = process.env.DSH_CLI || 'dsh'
const profileDir = path.join(dshHome(), 'profiles', profileName)
const manifest = () => readFileSync(path.join(profileDir, 'package.json'), 'utf8')
const deps = () => JSON.parse(manifest()).dependencies || {}
const snapshots = () => readdirSync(profileDir).filter((n) => n.indexOf('.plugin-backup-auto-') === 0).sort()
// Write the fixture range by hand: `dsh plugin add pkg@<range>` records an EXACT
// version (pnpm resolves the range and saves the pinned result), so a range can
// only be produced by editing the manifest. Then sync node_modules with install.
const setRange = async (range) => {
  const manifestPath = path.join(profileDir, 'package.json')
  const json = JSON.parse(readFileSync(manifestPath, 'utf8'))
  json.dependencies['dsh-whale-widget'] = range
  writeFileSync(manifestPath, JSON.stringify(json, null, 2) + '\n')
  return runCli(cli, ['plugin', '--profile', profileName, 'install'])
}

let passed = 0
let failed = 0
function check (name, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + name) } else { failed++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')) }
}

if (!existsSync(profileDir)) { console.log('profile not found: ' + profileDir); process.exit(2) }

const defs = []
plugin.apply({ tools: { register: (d) => defs.push(d) } })
const tool = defs[0] || {}
const required = (tool.parameters && tool.parameters.required) || []

console.log('0) tool contract')
check('registers exactly one tool', defs.length === 1, 'got ' + defs.length)
check('tool is named dsh_plugin_updates', tool.name === 'dsh_plugin_updates', String(tool.name))
check('action is required after defineTool normalisation', required.indexOf('action') >= 0, JSON.stringify(required))
check('schema exposes the four parameters', ['action', 'profiles', 'latest', 'snapshot'].every((k) => k in (tool.parameters.properties || {})))
check('tool declares a render function', Boolean(tool.output && typeof tool.output.render === 'function'))

// make sure we start from a caret range, which is what a normal install records
await setRange('^0.3.17')
const before = manifest()
check('fixture: dependency is caret-ranged', String(deps()['dsh-whale-widget']).charAt(0) === '^', String(deps()['dsh-whale-widget']))

console.log('')
console.log('1) check')
const checked = await tool.execute({ action: 'check' })
check('check ok', checked.ok === true, String(checked.reason))
const rows = (checked.reports || []).flatMap((r) => r.rows || [])
const whale = rows.find((r) => r.name === 'dsh-whale-widget')
check('found the updatable dependency', Boolean(whale), JSON.stringify(rows))
check('offers a version newer than the installed one', Boolean(whale) && whale.latest !== whale.current, JSON.stringify(whale))

console.log('')
console.log('2) apply (range-respecting)')
const applied = await tool.execute({ action: 'apply' })
check('apply ok', applied.ok === true, String(applied.reason))
check('apply asks for a restart', applied.restartRequired === true)
const report = (applied.reports || [])[0] || {}
check('apply reports the changed range', (report.changed || []).some((c) => c.indexOf('dsh-whale-widget') === 0), JSON.stringify(report.changed))
check('manifest really changed', manifest() !== before)
const snaps = snapshots()
check('snapshot directory created', snaps.length > 0, String(snaps.length))
check('snapshot holds the pre-apply manifest byte for byte', snaps.length > 0 && readFileSync(path.join(profileDir, snaps[snaps.length - 1], 'package.json'), 'utf8') === before)

console.log('')
console.log('3) rollback')
const rolled = await tool.execute({ action: 'rollback' })
check('rollback ok', rolled.ok === true, JSON.stringify(rolled.reports && rolled.reports[0]))
check('manifest restored to the pre-apply bytes', manifest() === before)

console.log('')
console.log('4) exact pin: pnpm is right to refuse, and we must say so')
await setRange('0.3.17')
const pinned = manifest()
check('fixture: dependency is exact-pinned', deps()['dsh-whale-widget'] === '0.3.17', String(deps()['dsh-whale-widget']))
const pinnedApply = await tool.execute({ action: 'apply' })
const pinnedReport = (pinnedApply.reports || [])[0] || {}
check('plain apply leaves the pin alone', manifest() === pinned)
check('and reports what the resolver offers instead', (pinnedReport.available || []).some((r) => r.name === 'dsh-whale-widget'), JSON.stringify(pinnedReport.available))
const latestApply = await tool.execute({ action: 'apply', latest: true })
const latestReport = (latestApply.reports || [])[0] || {}
check('latest=true does move the pin', latestApply.ok === true && manifest() !== pinned, JSON.stringify(latestReport.changed))
await tool.execute({ action: 'rollback' })
check('rollback returns to the pinned manifest', manifest() === pinned)

console.log('')
console.log('5) failure paths')
const unknown = await tool.execute({ action: 'check', profiles: 'definitely-not-a-profile' })
check('unknown profile is reported, not thrown', unknown.ok === false && (unknown.unknownProfiles || []).indexOf('definitely-not-a-profile') >= 0, JSON.stringify(unknown))
const badAction = await tool.execute({ action: 'explode' })
check('unknown action is refused', badAction.ok === false && String(badAction.reason).indexOf('unknown action') === 0, JSON.stringify(badAction))
const noCli = await tool.execute({ action: 'check' })
check('a normal check still works after the failure paths', noCli.ok === true)

console.log('')
console.log('passed ' + passed + ', failed ' + failed)
process.exit(failed === 0 ? 0 : 1)

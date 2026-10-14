import test from 'node:test'
import assert from 'node:assert/strict'
import { checkProfile, parseOutdated, parseOutdatedJson } from '../lib/outdated.js'
import { diffDeps } from '../lib/apply.js'

const BAR = String.fromCharCode(0x2502)
const DASH = String.fromCharCode(0x2500)
const row = (a, b, c) => [BAR, ' ' + a + ' ', BAR, ' ' + b + ' ', BAR, ' ' + c + ' ', BAR].join('')

test('parses the pnpm outdated table with box-drawing borders', () => {
  const text = [
    DASH.repeat(31),
    row('Package', 'Current', 'Latest'),
    row('dshmarket', '1.66.8', '1.66.9'),
    row('dsh-context', '0.59.2', '0.65.0'),
    row('@openviking/dsh-memory-plugin', '0.5.13', '0.5.16'),
    DASH.repeat(31),
  ].join(String.fromCharCode(10))
  assert.deepEqual(parseOutdated(text), [
    { name: 'dshmarket', current: '1.66.8', latest: '1.66.9' },
    { name: 'dsh-context', current: '0.59.2', latest: '0.65.0' },
    { name: '@openviking/dsh-memory-plugin', current: '0.5.13', latest: '0.5.16' },
  ])
})

test('parses ASCII borders and drops the header row', () => {
  const text = ['| Package | Current | Latest |', '| dsh-a | 1.0.0 | 1.0.1 |'].join(String.fromCharCode(10))
  assert.deepEqual(parseOutdated(text), [{ name: 'dsh-a', current: '1.0.0', latest: '1.0.1' }])
})

test('ignores the trailing dsh diagnostics line and plain prose', () => {
  const text = [
    '| dsh-a | 1.0.0 | 1.0.1 |',
    'dsh: plugin command failed; diagnostics: C:/x/.dsh/profiles/desktop/.plugin-manager/logs/op/pnpm.log',
    'Done in 3.2s using pnpm v11.7.0',
  ].join(String.fromCharCode(10))
  assert.equal(parseOutdated(text).length, 1)
})

test('diffDeps reports upgrades, additions and removals', () => {
  const changed = diffDeps({ a: '^1.0.0', b: '^2.0.0', c: '^3.0.0' }, { a: '^1.1.0', b: '^2.0.0', d: '^4.0.0' })
  assert.deepEqual(changed, ['a: ^1.0.0 -> ^1.1.0', 'd: (absent) -> ^4.0.0', 'c: removed'])
})

test('empty or garbage input yields no rows', () => {
  assert.deepEqual(parseOutdated(''), [])
  assert.deepEqual(parseOutdated('no table here'), [])
})

test('parseOutdatedJson reads the resolver verdict and flags rows an update cannot move', () => {
  // Real shape of pnpm outdated --json (measured 2026-10-14 on the three rows the user
  // reported): wanted === current means the newer release sits outside the recorded range.
  const text = [
    'ok Lockfile passes supply-chain policies (verified 4m ago)',
    JSON.stringify({
      'dsh-better-sidebar': { current: '0.24.1', latest: '0.26.0', wanted: '0.24.1', dependencyType: 'prod' },
      'dsh-other': { current: '1.0.0', latest: '1.2.0', wanted: '1.2.0', dependencyType: 'prod' }
    })
  ].join('\n')
  assert.deepEqual(parseOutdatedJson(text), [
    { name: 'dsh-better-sidebar', current: '0.24.1', latest: '0.26.0', wanted: '0.24.1', outOfRange: true },
    { name: 'dsh-other', current: '1.0.0', latest: '1.2.0', wanted: '1.2.0', outOfRange: false }
  ])
})

test('parseOutdatedJson says null when there is no JSON, and [] when the answer is empty', () => {
  assert.equal(parseOutdatedJson('| dsh-a | 1.0.0 | 1.0.1 |'), null)
  assert.equal(parseOutdatedJson(''), null)
  assert.equal(parseOutdatedJson('{'), null)
  assert.deepEqual(parseOutdatedJson('{}'), [])
})

test('checkProfile asks for --json and keeps the table parser as the fallback', async () => {
  // wanted only exists in the JSON form - it is the whole reason this flag is passed.
  const calls = []
  const jsonRun = async (cli, args) => {
    calls.push(args)
    return { code: 1, stdout: JSON.stringify({ 'dsh-a': { current: '1.0.0', latest: '1.1.0', wanted: '1.1.0' } }), stderr: '' }
  }
  const fromJson = await checkProfile({ cli: 'dsh', profile: 'p', run: jsonRun })
  assert.deepEqual(calls[0], ['plugin', '--profile', 'p', 'outdated', '--json'])
  assert.deepEqual(fromJson.rows, [{ name: 'dsh-a', current: '1.0.0', latest: '1.1.0', wanted: '1.1.0', outOfRange: false }])

  // A CLI that answers with the table instead still works; those rows carry no verdict.
  const tableRun = async () => ({ code: 1, stdout: '| dsh-a | 1.0.0 | 1.0.1 |', stderr: '' })
  const fromTable = await checkProfile({ cli: 'dsh', profile: 'p', run: tableRun })
  assert.deepEqual(fromTable.rows, [{ name: 'dsh-a', current: '1.0.0', latest: '1.0.1' }])
})

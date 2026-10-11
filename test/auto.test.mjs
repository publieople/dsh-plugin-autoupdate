/**
 * The scheduled check and the opt-in auto-apply (user, 2026-10-11: "定时检查,
 * 满足条件的自己更新").
 *
 * Pure decisions are tested directly, then the supervisor is driven end to end on a
 * fake clock, a fake CLI and a REAL profile directory in the temp folder - the settings
 * and the failure memory live in the state file, so exercising them through the actual
 * file is what proves a host restart would see the same thing the page wrote.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { checkDue, createAutoSupervisor, isEnabled, planAutoApply, stampOf, HEARTBEAT_MS, START_DELAY_MS } from '../lib/auto.js'
import { MAX_CHECK_MINUTES, failureKey, listLocks, lockPackage, normalizeSettings, noteFailure, readAuto, readFailures, writeSettings } from '../lib/state.js'

function tempProfile () {
  return mkdtempSync(path.join(tmpdir(), 'dsh-auto-'))
}

test('normalizeSettings coerces, clamps and keeps what it was not told about', () => {
  assert.deepEqual(normalizeSettings({}), { checkOnStart: false, checkEveryMinutes: 0, applyUpdates: false })
  assert.deepEqual(normalizeSettings({ checkOnStart: true, checkEveryMinutes: 90.4, applyUpdates: true }), { checkOnStart: true, checkEveryMinutes: 90, applyUpdates: true })
  assert.equal(normalizeSettings({ checkEveryMinutes: -5 }).checkEveryMinutes, 0)
  assert.equal(normalizeSettings({ checkEveryMinutes: 1e9 }).checkEveryMinutes, MAX_CHECK_MINUTES)
  assert.equal(normalizeSettings({ checkEveryMinutes: 'nonsense', applyUpdates: 'yes' }).checkEveryMinutes, 0)
  assert.equal(normalizeSettings({ checkEveryMinutes: 'nonsense', applyUpdates: 'yes' }).applyUpdates, false)
  // A patch that carries one toggle must not clear the others.
  const base = { checkOnStart: true, checkEveryMinutes: 180, applyUpdates: true }
  assert.deepEqual(normalizeSettings({ applyUpdates: false }, base), { checkOnStart: true, checkEveryMinutes: 180, applyUpdates: false })
})

test('isEnabled only when there is something to do', () => {
  assert.equal(isEnabled(null), false)
  assert.equal(isEnabled({ checkOnStart: false, checkEveryMinutes: 0, applyUpdates: true }), false)
  assert.equal(isEnabled({ checkOnStart: true, checkEveryMinutes: 0 }), true)
  assert.equal(isEnabled({ checkOnStart: false, checkEveryMinutes: 60 }), true)
})

test('checkDue is a pure function of the clock', () => {
  const t0 = Date.parse('2026-10-11T00:00:00.000Z')
  const off = { checkOnStart: false, checkEveryMinutes: 0, applyUpdates: false }
  assert.deepEqual(checkDue({ settings: off, since: t0, now: t0 }), { due: false, reason: 'disabled' })

  const onStart = { checkOnStart: true, checkEveryMinutes: 0 }
  // Before the delay it waits, so a host restart does not race its own startup.
  assert.deepEqual(checkDue({ settings: onStart, since: t0, now: t0 + START_DELAY_MS - 1 }), { due: false, reason: 'grace' })
  assert.deepEqual(checkDue({ settings: onStart, since: t0, now: t0 + START_DELAY_MS }), { due: true, reason: 'start' })
  // Once this process has done its start check, it does not do it again.
  assert.deepEqual(checkDue({ settings: onStart, since: t0, now: t0 + 10 * START_DELAY_MS, startupDone: true }), { due: false, reason: 'interval-off' })

  const hourly = { checkOnStart: false, checkEveryMinutes: 60 }
  assert.deepEqual(checkDue({ settings: hourly, since: t0, now: t0 + 59 * 60000 }), { due: false, reason: 'not-due' })
  assert.deepEqual(checkDue({ settings: hourly, since: t0, now: t0 + 60 * 60000 }), { due: true, reason: 'interval' })
  // lastCheckAt survives host restarts, so the interval keeps its phase.
  const auto = { lastCheckAt: new Date(t0).toISOString() }
  assert.equal(checkDue({ settings: hourly, auto, since: t0 + 59 * 60000, now: t0 + 60 * 60000 }).due, true)
  assert.equal(checkDue({ settings: hourly, auto, since: t0 - 30 * 60000, now: t0 + 29 * 60000 }).due, false)
})

test('planAutoApply never applies a locked row, a failed pair, or anything without the switch', () => {
  const rows = [{ name: 'a', latest: '2' }, { name: 'b', latest: '3' }]
  assert.deepEqual(planAutoApply({ settings: { applyUpdates: false }, rows }), { apply: false, wanted: [], skipped: [] })
  assert.deepEqual(planAutoApply({ settings: null, rows }).apply, false)
  assert.deepEqual(planAutoApply({ settings: { applyUpdates: true }, rows }).wanted, rows)

  const failures = { [failureKey('a', '2')]: '2026-10-11T00:00:00.000Z' }
  const plan = planAutoApply({ settings: { applyUpdates: true }, rows, failures })
  assert.equal(plan.apply, true)
  assert.deepEqual(plan.wanted.map((row) => row.name), ['b'])
  assert.deepEqual(plan.skipped, [{ name: 'a', latest: '2', reason: 'failed-before', at: failures[failureKey('a', '2')] }])
  // A NEWER version is a different pair and is tried again.
  assert.deepEqual(planAutoApply({ settings: { applyUpdates: true }, rows: [{ name: 'a', latest: '3' }], failures }).wanted.length, 1)
  // Nothing left to do: no apply at all, so no snapshot is written for nothing.
  assert.equal(planAutoApply({ settings: { applyUpdates: true }, rows: [{ name: 'a', latest: '2' }], failures }).apply, false)
})

test('stampOf is the 14 digits the snapshot directory and the CLI runs share', () => {
  assert.equal(stampOf(new Date('2026-10-11T01:02:03.456Z')), '20261011010203')
})

/** A supervisor on a fake clock, with a real profile directory behind the state file. */
function harness (overrides = {}) {
  const profileDir = overrides.profileDir || tempProfile()
  const dir = profileDir
  const clock = { at: Date.parse('2026-10-11T00:00:00.000Z') }
  const calls = { check: 0, apply: [], prune: 0, failures: [], logs: [] }
  const timers = { set: [], cleared: [] }
  const supervisor = createAutoSupervisor({
    profiles: () => ['m1test'],
    profileDirOf: () => dir,
    check: async ({ profile }) => { calls.check += 1; return { profile, rows: [] } },
    apply: async (args) => { calls.apply.push(args); return { code: 0, changed: ['dsh-x: 1.0.0 -> 1.1.0'] } },
    prune: () => { calls.prune += 1 },
    noteFailureFn: (target, entries, at) => { calls.failures.push({ entries, at }); return noteFailure(target, entries, at) },
    now: () => clock.at,
    stamp: () => new Date(clock.at).toISOString(),
    setTimer: (fn, ms) => { const handle = { fn, ms, unref () {} }; timers.set.push(handle); return handle },
    clearTimer: (handle) => { timers.cleared.push(handle) },
    startDelayMs: 0,
    heartbeatMs: HEARTBEAT_MS,
    log: (line) => calls.logs.push(line),
    ...overrides.options,
  })
  // beat() is what the heartbeat calls; standalone tests drive it directly, starting
  // the supervisor first so the "stopped means stopped" guard is not what they measure.
  const beat = () => { if (!supervisor.isRunning()) supervisor.start(); return supervisor.beat() }
  return { dir, clock, calls, timers, supervisor, beat, profileDir: dir }
}

test('a profile with the switch off is never checked', async () => {
  const h = harness()
  writeSettings(h.dir, { checkOnStart: false, checkEveryMinutes: 0, applyUpdates: false })
  const result = await h.beat()
  assert.deepEqual(result, { results: [] })
  assert.equal(h.calls.check, 0)
  assert.deepEqual(readAuto(h.dir), {})
})

test('checkOnStart runs once per host start, and records why', async () => {
  const h = harness()
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0, applyUpdates: false })
  await h.beat()
  assert.equal(h.calls.check, 1)
  const auto = readAuto(h.dir)
  assert.equal(auto.lastCheckReason, 'start')
  assert.equal(auto.lastOffers, 0)
  assert.equal(auto.lastApplyCode, null)
  // Same process, second beat: the start check is done, and there is no interval.
  await h.beat()
  assert.equal(h.calls.check, 1)
})

test('an interval fires on time, and turning it on takes effect without a restart', async () => {
  const h = harness()
  writeSettings(h.dir, { checkOnStart: false, checkEveryMinutes: 60, applyUpdates: false })
  await h.beat()
  assert.equal(h.calls.check, 0) // the baseline is this process's start
  h.clock.at += 60 * 60000
  await h.beat()
  assert.equal(h.calls.check, 1)
  assert.equal(readAuto(h.dir).lastCheckReason, 'interval')

  // A switch flipped on the page changes the next beat, not the next host start.
  writeSettings(h.dir, { checkEveryMinutes: 0 })
  h.clock.at += 60 * 60000
  await h.beat()
  assert.equal(h.calls.check, 1)
})

test('a locked package is offered to nobody, so the timer cannot override a lock', async () => {
  const h = harness({
    options: {
      check: async ({ profile }) => ({ profile, rows: [{ name: 'locked', latest: '2' }, { name: 'free', latest: '2' }] }),
      locksOf: (dir) => listLocks(dir),
    },
  })
  lockPackage(h.dir, { name: 'locked', version: '1' })
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0, applyUpdates: true })
  await h.beat()
  assert.equal(h.calls.apply.length, 1)
  const auto = readAuto(h.dir)
  assert.equal(auto.lastOffers, 1)
  assert.deepEqual(auto.lastApplied, ['dsh-x: 1.0.0 -> 1.1.0'])
  assert.equal(h.calls.prune, 1)
  // The failure memory stayed empty because the one apply succeeded.
  assert.deepEqual(readFailures(h.dir), {})
})

test('a pair that failed before is skipped until a different version shows up', async () => {
  let latest = '2'
  const h = harness({
    options: { check: async ({ profile }) => ({ profile, rows: [{ name: 'flaky', latest }] }) },
  })
  noteFailure(h.dir, [{ name: 'flaky', latest: '2' }])
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 60, applyUpdates: true })
  await h.beat()
  assert.equal(h.calls.apply.length, 0)
  assert.deepEqual(readAuto(h.dir).lastSkipped, ['flaky@2'])

  // A newer version is a different pair, so the next due check tries again.
  latest = '3'
  h.clock.at += 60 * 60000
  await h.beat()
  assert.equal(h.calls.apply.length, 1)
  assert.deepEqual(readAuto(h.dir).lastApplied, ['dsh-x: 1.0.0 -> 1.1.0'])
})

test('a failed apply is remembered, so one broken call does not rerun every beat', async () => {
  const h = harness({
    options: {
      check: async ({ profile }) => ({ profile, rows: [{ name: 'broken', latest: '2' }] }),
      apply: async (args) => { h.calls.apply.push(args); return { code: 1, changed: [], stderr: 'ERR_PNPM_NO_MATCHING_VERSION\n' } },
    },
  })
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 60, applyUpdates: true })
  await h.beat()
  assert.match(readAuto(h.dir).lastError, /ERR_PNPM_NO_MATCHING_VERSION/)
  assert.ok(readFailures(h.dir)[failureKey('broken', '2')])
  assert.equal(h.calls.prune, 0)

  // Next beat, same offer: planned away instead of run again.
  h.clock.at += 60 * 60000
  await h.beat()
  assert.equal(h.calls.apply.length, 1)
  assert.deepEqual(readAuto(h.dir).lastSkipped, ['broken@2'])
})

test('an apply that moves nothing (an exact pin) counts as failed instead of spinning', async () => {
  const h = harness({
    options: {
      check: async ({ profile }) => ({ profile, rows: [{ name: 'pinned', latest: '2' }] }),
      apply: async (args) => { h.calls.apply.push(args); return { code: 0, changed: [] } },
    },
  })
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0, applyUpdates: true })
  await h.beat()
  assert.equal(readAuto(h.dir).lastError, 'nothing moved')
  assert.ok(readFailures(h.dir)[failureKey('pinned', '2')])
  assert.equal(h.calls.prune, 0)
})

test('a check that throws is recorded as the run, so a missing CLI cannot spin', async () => {
  const h = harness({
    options: { check: async () => { h.calls.check += 1; throw new Error('dsh: not found') }, startDelayMs: 0 },
  })
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0, applyUpdates: true })
  await h.beat()
  const auto = readAuto(h.dir)
  assert.equal(auto.lastCheckReason, 'failed')
  assert.match(auto.lastError, /dsh: not found/)
  assert.deepEqual(auto.lastApplied, [])
  await h.beat()
  assert.equal(h.calls.check, 1)
})

test('one beat at a time: a slow check is not stacked by the next beat', async () => {
  let release = () => {}
  const gate = new Promise((resolve) => { release = resolve })
  const h = harness({
    options: {
      check: async () => { h.calls.check += 1; await gate; return { profile: 'm1test', rows: [] } },
    },
  })
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0 })
  const first = h.beat()
  await Promise.resolve()
  const second = await h.beat()
  assert.deepEqual(second, { skipped: 'busy' })
  release()
  await first
  assert.equal(h.calls.check, 1)
})

test('the heartbeat is armed with unref and disarmed on stop', async () => {
  const h = harness()
  writeSettings(h.dir, { checkOnStart: true, checkEveryMinutes: 0 })
  h.supervisor.start()
  assert.equal(h.supervisor.isRunning(), true)
  assert.equal(h.timers.set.length, 1)
  assert.equal(h.timers.set[0].ms, HEARTBEAT_MS)
  h.supervisor.stop()
  assert.equal(h.supervisor.isRunning(), false)
  assert.equal(h.timers.cleared.length, 1)
  const afterStop = await h.supervisor.beat()
  assert.deepEqual(afterStop, { skipped: 'stopped' })
  h.supervisor.start()
  assert.equal(h.timers.set.length, 2)
})

test('an empty profile list is a no-op, not a crash', async () => {
  const h = harness({ options: { profiles: () => [] } })
  assert.deepEqual(await h.beat(), { results: [] })
  assert.deepEqual(await h.beat(), { results: [] })
  assert.equal(h.calls.check, 0)
})

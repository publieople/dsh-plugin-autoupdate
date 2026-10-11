/**
 * Scheduled check, and the opt-in automatic apply.
 *
 * The user asked for exactly this on 2026-10-11: "定时检查, 满足条件的自己更新,
 * 重启后生效无所谓" - a scheduled check, and update itself when the conditions are met;
 * taking effect after the next DSH start is fine.
 *
 * Two boundaries are non-negotiable, and both were already this plugin's design:
 *   1. the timer only ever runs the same `dsh plugin update` a human would run. It
 *      never touches `add pkg@x.y.z`, so pnpm's minimum-release-age policy and the
 *      profile's semver ranges keep deciding what is eligible - exactly as before;
 *   2. a package the user locked is never auto-applied (locked rows never reach
 *      planAutoApply), and a name@version that already failed is not retried in a
 *      loop. Without that, one broken CLI call would re-run every beat all day.
 *
 * Timing is a heartbeat, not a fixed interval chain: every beat re-reads the profile's
 * settings and the previous run's timestamp. Flipping the switch on the page therefore
 * takes effect within one beat instead of needing a host restart (a host half only
 * reloads when the process starts).
 */
import { failureKey, listLocks, noteFailure, readAuto, readFailures, readSettings, recordAuto, splitLocked } from './state.js'

export const HEARTBEAT_MS = 60000

/**
 * A checkOnStart check waits this long before its first run, so a host restart does not
 * race the profile's own startup work (pnpm install, the DSH plugin loader, our own
 * catalog warm-up).
 */
export const START_DELAY_MS = 60000

/** True when the schedule is on at all. */
export function isEnabled (settings) {
  if (!settings) return false
  return settings.checkOnStart === true || (Number(settings.checkEveryMinutes) || 0) > 0
}

/**
 * Whether this profile is due for a check. Pure given a clock, which is what makes the
 * schedule testable without waiting a minute for anything.
 *   - startupDone is per PROCESS: checkOnStart means "once per host start", while
 *     lastCheckAt in the state file survives restarts and drives the interval.
 */
export function checkDue ({ settings, auto = {}, now = Date.now(), since = now, startupDone = false, startDelayMs = START_DELAY_MS }) {
  if (!isEnabled(settings)) return { due: false, reason: 'disabled' }
  const every = (Number(settings.checkEveryMinutes) || 0) * 60000
  if (!startupDone && settings.checkOnStart === true) {
    return now - since >= startDelayMs ? { due: true, reason: 'start' } : { due: false, reason: 'grace' }
  }
  if (every <= 0) return { due: false, reason: 'interval-off' }
  const last = auto && auto.lastCheckAt ? Date.parse(auto.lastCheckAt) : NaN
  const baseline = Number.isFinite(last) ? last : since
  return now - baseline >= every ? { due: true, reason: 'interval' } : { due: false, reason: 'not-due' }
}

/**
 * What the timer may do with the rows a check just returned. Pure, so the safety rules
 * are testable without a CLI:
 *   - rows are the OFFERABLE rows (splitLocked already removed the locked ones);
 *   - a pair that failed before is skipped until a different version is offered, or the
 *     user clears the failure memory.
 */
export function planAutoApply ({ settings, rows = [], failures = {} }) {
  const wanted = []
  const skipped = []
  for (const row of rows) {
    const at = failures[failureKey(row.name, row.latest)]
    if (at) { skipped.push({ name: row.name, latest: row.latest, reason: 'failed-before', at }); continue }
    wanted.push(row)
  }
  const apply = Boolean(settings) && settings.applyUpdates === true && wanted.length > 0
  return { apply, wanted: apply ? wanted : [], skipped }
}

/** The 14-digit stamp the snapshot directory and the CLI runs share. */
export function stampOf (date = new Date()) {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

/**
 * The supervisor. One heartbeat walks every profile this host owns, and for each one:
 * read settings -> is it due -> check -> (maybe) snapshot + apply -> record the result.
 *
 * Every collaborator is injectable, so test/auto.test.mjs drives the whole thing on a
 * fake clock and a fake CLI: no DSH, no socket, no waiting.
 */
export function createAutoSupervisor (options = {}) {
  const {
    profiles = () => [],
    profileDirOf = (profile) => profile,
    check,
    apply,
    prune = () => {},
    locksOf = listLocks,
    autoOf = readAuto,
    recordAutoFn = recordAuto,
    failuresOf = readFailures,
    noteFailureFn = noteFailure,
    now = () => Date.now(),
    stamp = () => new Date().toISOString(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    heartbeatMs = HEARTBEAT_MS,
    startDelayMs = START_DELAY_MS,
    log = () => {},
  } = options

  const startedAt = now()
  const startupDone = new Set()
  let busy = false
  let running = false
  let timer = null

  /** One profile, one due check, and the apply that may follow it. */
  async function runProfile (profile, reason) {
    const profileDir = profileDirOf(profile)
    const settings = readSettings(profileDir)
    const report = await check({ profile })
    // Locked packages leave the offer here, before anything can be applied: a lock is
    // the user saying "not this one", and the timer has no business overriding it.
    const split = splitLocked(report, locksOf(profileDir))
    const plan = planAutoApply({ settings, rows: split.rows, failures: failuresOf(profileDir) })
    const at = stamp()
    let applied = []
    let code = null
    let error = null

    if (plan.apply) {
      const result = await apply({ profile, profileDir, stamp: stampOf(new Date(at)) })
      code = result.code === undefined ? null : result.code
      applied = result.changed || []
      if (result.code !== 0) {
        // Remember the pair, not the package: the next version is a fresh attempt.
        noteFailureFn(profileDir, plan.wanted, at)
        error = String(result.stderr || '').trim().slice(0, 400) || ('exit ' + result.code)
      } else if (applied.length === 0) {
        // The resolver offered it but the manifest did not move (an exact pin does
        // this). Retrying every beat would spin, so treat it as a failed attempt.
        noteFailureFn(profileDir, plan.wanted, at)
        error = 'nothing moved'
      } else {
        prune(profileDir)
      }
    }

    const auto = recordAutoFn(profileDir, {
      lastCheckAt: at,
      lastCheckReason: reason,
      lastOffers: split.rows.length,
      lastApplyCode: code,
      lastApplied: applied,
      lastError: error,
      lastSkipped: plan.skipped.map((item) => item.name + '@' + item.latest),
      settings,
    })
    log('[' + profile + '] ' + reason + ': ' + split.rows.length + ' offer(s), applied ' + applied.length
      + (error ? (', error: ' + error) : ''))
    return { profile, offers: split.rows.length, applied, error, auto }
  }

  async function beat () {
    if (busy || !running) return { skipped: busy ? 'busy' : 'stopped' }
    busy = true
    try {
      const results = []
      for (const profile of profiles() || []) {
        const profileDir = profileDirOf(profile)
        try {
          const due = checkDue({
            settings: readSettings(profileDir),
            auto: autoOf(profileDir),
            now: now(),
            since: startedAt,
            startupDone: startupDone.has(profile),
            startDelayMs,
          })
          if (!due.due) continue
          results.push(await runProfile(profile, due.reason))
        } catch (err) {
          // A failed attempt still counts as the run, or a missing CLI would spawn a
          // process every beat forever. The interval (or the next host start) decides
          // when to try again.
          const message = String((err && err.message) || err).slice(0, 400)
          try { recordAutoFn(profileDir, { lastCheckAt: stamp(), lastCheckReason: 'failed', lastError: message, lastApplied: [] }) } catch {}
          log('[' + profile + '] check failed: ' + message)
        }
        startupDone.add(profile)
      }
      return { results }
    } finally {
      busy = false
    }
  }

  function loop () {
    if (!running) return
    timer = setTimer(() => { void beat().finally(loop) }, heartbeatMs)
    // Never hold the host process open just to run a timer.
    if (timer && typeof timer.unref === 'function') timer.unref()
  }

  return {
    start () {
      if (running) return
      running = true
      loop()
    },
    stop () {
      running = false
      if (timer) clearTimer(timer)
      timer = null
    },
    beat,
    isRunning: () => running,
  }
}

/**
 * Per-profile state this plugin owns: the lock list, the auto-update switch and the
 * outcome of the last scheduled run.
 *
 * A lock means "stop offering updates for this package". It is OUR list in OUR file
 * inside the profile directory - deliberately not a version pin in package.json,
 * because the only supported way to pin is `dsh plugin add pkg@x`, and that is
 * exactly what writes the user a minimumReleaseAgeExclude entry and bypasses the
 * release-age gate. A lock suppresses the offer; it never touches what pnpm resolves.
 *
 * The auto-update settings live here for the same reason: they are per profile (which
 * is what the page and the host both key on), they never pin a version, and turning
 * `applyUpdates` on only lets the timer run the same `dsh plugin update` a human
 * would run - snapshot first, locked packages excluded.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const STATE_FILE = '.plugin-autoupdate.json'

/**
 * Nothing scheduled runs until the user asks for it: checkOnStart is one check shortly
 * after the host starts, checkEveryMinutes is a recurring check (0 = off), and
 * applyUpdates is what lets a check write to the profile at all.
 */
export const DEFAULT_SETTINGS = {
  checkOnStart: false,
  checkEveryMinutes: 0,
  applyUpdates: false,
}

/** A week. Longer than this is a typo, not a schedule. */
export const MAX_CHECK_MINUTES = 7 * 24 * 60

/** How many failed name@version pairs we remember, so a broken update is not retried. */
export const MAX_FAILURE_MEMORY = 50

export function statePath (profileDir) {
  return path.join(profileDir, STATE_FILE)
}

/**
 * Coerce whatever is on disk or in a request body into settings we can trust: booleans
 * stay booleans, the interval is a whole number of minutes inside [0, MAX], and a
 * missing field keeps the value it had (so a page that sends one toggle never clears
 * the others).
 */
export function normalizeSettings (input, base = DEFAULT_SETTINGS) {
  const source = input && typeof input === 'object' ? input : {}
  const minutes = Number(source.checkEveryMinutes)
  return {
    checkOnStart: typeof source.checkOnStart === 'boolean' ? source.checkOnStart : base.checkOnStart === true,
    checkEveryMinutes: Number.isFinite(minutes)
      ? Math.max(0, Math.min(MAX_CHECK_MINUTES, Math.round(minutes)))
      : (Number(base.checkEveryMinutes) || 0),
    applyUpdates: typeof source.applyUpdates === 'boolean' ? source.applyUpdates : base.applyUpdates === true,
  }
}

export function readState (profileDir) {
  const empty = { locks: [], settings: { ...DEFAULT_SETTINGS }, auto: {}, failures: {} }
  const file = statePath(profileDir)
  if (!existsSync(file)) return empty
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return {
      locks: Array.isArray(parsed.locks) ? parsed.locks : [],
      settings: normalizeSettings(parsed.settings),
      auto: parsed.auto && typeof parsed.auto === 'object' ? parsed.auto : {},
      failures: parsed.failures && typeof parsed.failures === 'object' ? parsed.failures : {},
    }
  } catch { return empty }
}

/**
 * Write through a temp file so an interrupted write cannot leave invalid JSON, and
 * always write the WHOLE state: the lock list, the settings, the last run and the
 * failure memory share one file, so a partial write from one code path would silently
 * drop another's data.
 */
export function writeState (profileDir, state) {
  const current = readState(profileDir)
  const next = {
    version: 1,
    locks: state.locks !== undefined ? state.locks : current.locks,
    settings: normalizeSettings(state.settings, current.settings),
    auto: state.auto !== undefined ? state.auto : current.auto,
    failures: state.failures !== undefined ? state.failures : current.failures,
  }
  const file = statePath(profileDir)
  const temp = file + '.tmp'
  writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  renameSync(temp, file)
  return next
}

export function listLocks (profileDir) {
  return readState(profileDir).locks
}

export function lockPackage (profileDir, entry, now = () => new Date().toISOString()) {
  const name = String(entry.name || '').trim()
  if (name === '') throw new Error('lock needs a package name')
  const locks = listLocks(profileDir).filter((item) => item.name !== name)
  locks.push({ name, version: entry.version || null, note: entry.note || null, lockedAt: now() })
  locks.sort((a, b) => a.name.localeCompare(b.name))
  writeState(profileDir, { locks })
  return locks
}

export function unlockPackage (profileDir, name) {
  const wanted = String(name || '').trim()
  const locks = listLocks(profileDir).filter((item) => item.name !== wanted)
  writeState(profileDir, { locks })
  return locks
}

export function readSettings (profileDir) {
  return readState(profileDir).settings
}

/** Merge a patch into the stored settings; an empty patch is a plain read-back. */
export function writeSettings (profileDir, patch) {
  const current = readState(profileDir)
  const settings = normalizeSettings(patch, current.settings)
  writeState(profileDir, { settings })
  return settings
}

export function readAuto (profileDir) {
  return readState(profileDir).auto
}

/** Merge the last scheduled-run facts, so /status can say when it ran and what it did. */
export function recordAuto (profileDir, entry) {
  const auto = { ...readState(profileDir).auto, ...entry }
  writeState(profileDir, { auto })
  return auto
}

export function readFailures (profileDir) {
  return readState(profileDir).failures
}

export function failureKey (name, latest) {
  return String(name) + '@' + String(latest)
}

/**
 * Remember which name@version pairs failed, so the timer does not retry them forever.
 * The key includes the version on purpose: when a NEWER version appears the pair is a
 * different key and the package is offered again.
 */
export function noteFailure (profileDir, entries, at = new Date().toISOString()) {
  const failures = { ...readState(profileDir).failures }
  for (const entry of entries || []) failures[failureKey(entry.name, entry.latest)] = at
  const keys = Object.keys(failures)
  if (keys.length > MAX_FAILURE_MEMORY) {
    const oldest = keys.sort((a, b) => String(failures[a]).localeCompare(String(failures[b])))
    for (const key of oldest.slice(0, keys.length - MAX_FAILURE_MEMORY)) delete failures[key]
  }
  writeState(profileDir, { failures })
  return failures
}

/** The escape hatch behind "跳过 N 个（上次失败）": forget every failure and retry. */
export function clearFailures (profileDir) {
  writeState(profileDir, { failures: {} })
  return {}
}

/**
 * Move locked packages out of the offerable rows and into their own list, so the
 * page can show them under their own tab and the agent gets the same view.
 */
export function splitLocked (report, locks) {
  const names = new Set((locks || []).map((item) => item.name))
  const rows = Array.isArray(report.rows) ? report.rows : []
  return {
    ...report,
    rows: rows.filter((row) => !names.has(row.name)),
    lockedRows: rows.filter((row) => names.has(row.name)),
    locks: locks || [],
  }
}

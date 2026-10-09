/**
 * Per-profile state this plugin owns: the lock list.
 *
 * A lock means "stop offering updates for this package". It is OUR list in OUR
 * file inside the profile directory - deliberately not a version pin in
 * package.json, because the only supported way to pin is `dsh plugin add pkg@x`,
 * and that is exactly what writes the user a minimumReleaseAgeExclude entry and
 * bypasses the release-age gate. A lock suppresses the offer; it never touches
 * what pnpm resolves.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const STATE_FILE = '.plugin-autoupdate.json'

export function statePath (profileDir) {
  return path.join(profileDir, STATE_FILE)
}

export function readState (profileDir) {
  const file = statePath(profileDir)
  if (!existsSync(file)) return { locks: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return { locks: Array.isArray(parsed.locks) ? parsed.locks : [] }
  } catch { return { locks: [] } }
}

/** Write through a temp file so an interrupted write cannot leave invalid JSON. */
export function writeState (profileDir, state) {
  const file = statePath(profileDir)
  const temp = file + '.tmp'
  writeFileSync(temp, JSON.stringify({ version: 1, locks: state.locks || [] }, null, 2) + '\n', 'utf8')
  renameSync(temp, file)
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

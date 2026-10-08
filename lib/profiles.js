/**
 * Profile discovery. A DSH profile is a directory under $DSH_HOME/profiles that
 * has a package.json; `dsh plugin --profile <name> ...` is the only supported way
 * to change one, so everything below only ever reports names.
 */
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function dshHome (env = process.env) {
  return env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function listProfiles (home = dshHome()) {
  const root = path.join(home, 'profiles')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => existsSync(path.join(root, n, 'package.json')))
    .sort()
}

/**
 * Which profiles a call is about: an explicit comma-separated list wins, then the
 * profile this DSH instance runs (DSH_PROFILE), then nothing.
 * Returns { profiles, unknown, all } - unknown names are reported, never guessed.
 */
export function resolveProfiles (requested, env = process.env, home = dshHome(env)) {
  const all = listProfiles(home)
  const wanted = String(requested || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (wanted.length > 0) {
    return { profiles: wanted.filter((n) => all.includes(n)), unknown: wanted.filter((n) => !all.includes(n)), all }
  }
  const current = env.DSH_PROFILE
  if (current) return { profiles: all.includes(current) ? [current] : [], unknown: [], all }
  return { profiles: [], unknown: [], all }
}

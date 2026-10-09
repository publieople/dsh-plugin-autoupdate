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
 * The profile a call is about when the caller named none.
 *
 * Order matters, and the middle step is the one that is easy to miss: the official
 * Electron app does NOT export DSH_PROFILE - it carries the profile in its own
 * launcher context - so a plugin that only reads the environment resolves nothing
 * at all inside the app. `hint` is the launcher's answer, threaded in by the
 * caller (see lib/index.js and lib/http.js).
 *
 * Falling back to the conventional 'desktop' profile is deliberate: the app owns
 * that name. With several profiles and no hint at all we resolve nothing rather
 * than pick one for the user.
 */
export function defaultProfile (all, env = process.env, hint) {
  const current = env.DSH_PROFILE
  if (current && all.includes(current)) return current
  if (hint && all.includes(hint)) return hint
  if (all.includes('desktop')) return 'desktop'
  if (all.length === 1) return all[0]
  return undefined
}

/**
 * Which profiles a call is about: an explicit comma-separated list wins, then the
 * running profile (see defaultProfile above).
 * Returns { profiles, unknown, all, defaulted } - unknown names are reported,
 * never guessed.
 */
export function resolveProfiles (requested, env = process.env, home = dshHome(env), hint) {
  const all = listProfiles(home)
  const wanted = String(requested || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (wanted.length > 0) {
    return { profiles: wanted.filter((n) => all.includes(n)), unknown: wanted.filter((n) => !all.includes(n)), all, defaulted: false }
  }
  const fallback = defaultProfile(all, env, hint)
  return { profiles: fallback === undefined ? [] : [fallback], unknown: [], all, defaulted: fallback !== undefined }
}

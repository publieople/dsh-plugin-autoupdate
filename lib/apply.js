/**
 * Snapshot -> apply -> (optionally) roll back. The three rules this file exists to keep:
 *   1. NEVER pin a version. `pnpm add pkg@1.2.3` would write a minimumReleaseAgeExclude
 *      entry and silently bypass the user supply-chain policy. Only `update` is used.
 *   2. Snapshot the profile config BEFORE touching anything, so a bad update is one
 *      command away from undone.
 *   3. Report what actually changed; a non-zero exit with an unchanged manifest is
 *      not a successful update.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { runCli } from './outdated.js'

export const SNAPSHOT_FILES = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.patch.yml']

export function readDeps (profileDir) {
  const file = path.join(profileDir, 'package.json')
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed.dependencies || {}
  } catch {
    return {}
  }
}

export function diffDeps (before, after) {
  const out = []
  for (const [name, version] of Object.entries(after)) {
    if (before[name] !== version) out.push(name + ': ' + (before[name] || '(absent)') + ' -> ' + version)
  }
  for (const name of Object.keys(before)) {
    if (!(name in after)) out.push(name + ': removed')
  }
  return out
}

export function snapshotProfile (profileDir, stamp) {
  const dir = path.join(profileDir, '.plugin-backup-auto-' + stamp)
  mkdirSync(dir, { recursive: true })
  const copied = []
  for (const file of SNAPSHOT_FILES) {
    const from = path.join(profileDir, file)
    if (!existsSync(from)) continue
    copyFileSync(from, path.join(dir, file))
    copied.push(file)
  }
  return { dir, copied }
}

export function listSnapshots (profileDir) {
  try {
    return readdirSync(profileDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('.plugin-backup-auto-'))
      .map((e) => e.name)
      .sort()
      .reverse()
  } catch {
    return []
  }
}

export async function applyUpdate ({ cli, profile, profileDir, latest = false, run = runCli, stamp }) {
  const before = readDeps(profileDir)
  const snap = snapshotProfile(profileDir, stamp)
  const args = ['plugin', '--profile', profile, 'update']
  if (latest) args.push('--latest')
  const res = await run(cli, args)
  const after = readDeps(profileDir)
  const changed = diffDeps(before, after)
  return {
    profile,
    code: res.code,
    latest,
    snapshot: snap.dir,
    changed,
    stdout: res.stdout,
    stderr: res.stderr,
    installCount: (res.stdout.match(/Packages:\s*\+\d+/g) || []).join(' '),
  }
}

/**
 * Restore a snapshot and reinstall, so node_modules matches the manifest again.
 * `snapshot` may be a name, an absolute path, or omitted for the newest snapshot.
 */
export async function rollback ({ cli, profile, profileDir, snapshot, run = runCli }) {
  const snapshots = listSnapshots(profileDir)
  const chosen = snapshot
    ? (path.isAbsolute(snapshot) ? snapshot : path.join(profileDir, snapshot))
    : (snapshots.length > 0 ? path.join(profileDir, snapshots[0]) : null)
  if (!chosen || !existsSync(chosen)) {
    return { profile, ok: false, reason: 'no snapshot found', snapshots }
  }
  const restored = []
  for (const file of SNAPSHOT_FILES) {
    const from = path.join(chosen, file)
    if (!existsSync(from)) continue
    copyFileSync(from, path.join(profileDir, file))
    restored.push(file)
  }
  const res = await run(cli, ['plugin', '--profile', profile, 'install'])
  return { profile, ok: res.code === 0, snapshot: chosen, restored, code: res.code, stderr: res.stderr, snapshots }
}

export function pruneSnapshots (profileDir, keep = 5) {
  const snapshots = listSnapshots(profileDir)
  for (const name of snapshots.slice(keep)) {
    try { rmSync(path.join(profileDir, name), { recursive: true, force: true }) } catch {}
  }
  return snapshots.slice(keep)
}

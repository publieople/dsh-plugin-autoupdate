/**
 * Run the DSH CLI and parse `pnpm outdated` output.
 *
 * IMPORTANT: we never resolve versions ourselves. `dsh plugin --profile X update`
 * already applies BOTH filters we want and neither of them is ours to reimplement:
 *   - the semver range recorded in the profile's package.json, and
 *   - pnpm's supply-chain minimum-release-age policy (what 'just published' means
 *     is pnpm's call, not ours).
 * `pnpm outdated` shows exactly what that resolver accepts, which is why this
 * plugin reports its table verbatim instead of querying the registry itself.
 */
import { spawn } from 'node:child_process'

export function runCli (cli, args, options = {}) {
  const { cwd, timeoutMs = 300000 } = options
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cli, args, { cwd, shell: process.platform === 'win32', windowsHide: true })
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: String(err && err.message) })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code, extra) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr: extra ? stderr + '\n' + extra : stderr })
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish(-1, '[timeout after ' + timeoutMs + 'ms]')
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => finish(-1, String(err && err.message)))
    child.on('close', (code) => finish(code == null ? -1 : code))
  })
}

/**
 * Parse the pnpm outdated table. Rows look like:
 *   | dshmarket | 1.66.8 | 1.66.9 |
 * Anything that is not a three-cell data row (borders, headers, the trailing
 * 'dsh: plugin command failed' diagnostic) is ignored.
 */
export function parseOutdated (text) {
  const rows = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('|') && !line.startsWith('\u2502')) continue
    const cells = line.split(/[|\u2502]/).map((s) => s.trim()).filter((s) => s.length > 0)
    if (cells.length < 3) continue
    const name = cells[0]
    if (name === 'Package') continue
    if (!/^[@A-Za-z0-9][A-Za-z0-9@/._-]*$/.test(name)) continue
    rows.push({ name, current: cells[1], latest: cells[2] })
  }
  return rows
}

export async function checkProfile ({ cli, profile, run = runCli }) {
  const res = await run(cli, ['plugin', '--profile', profile, 'outdated'])
  return { profile, code: res.code, rows: parseOutdated(res.stdout + '\n' + res.stderr), stderr: res.stderr.trim() }
}

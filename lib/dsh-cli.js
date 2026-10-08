/**
 * Locate the DeepSeek Harness CLI. Three sources, most specific first:
 *   1. DSH_CLI            - explicit override, for tests and odd installs;
 *   2. the running app    - <dir of the DSH executable>/resources/runtime/cli/bin/dsh.*,
 *                           which is where the desktop build keeps it;
 *   3. bare 'dsh'         - resolved from PATH (npm-global install).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export function findDshCli (env = process.env, execPath = process.execPath) {
  if (env.DSH_CLI && existsSync(env.DSH_CLI)) return env.DSH_CLI
  if (execPath) {
    const bin = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
    const candidate = path.join(path.dirname(execPath), 'resources', 'runtime', 'cli', 'bin', bin)
    if (existsSync(candidate)) return candidate
  }
  return process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
}

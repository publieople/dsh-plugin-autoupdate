/**
 * Self-restart for the hosts that support it.
 *
 * What is deliberately NOT here: relaunching the official Desktop app. Desktop
 * publishes no restart service and no IPC for one, and its own composition sets
 * `allowRestart: false` with the reason spelled out (apps/desktop, and dsh-market's
 * desktop branch): "relaunching a raw Electron process would bypass Desktop's
 * launcher lifecycle". So the capability is reported as unsupported there and the
 * page says who owns the restart instead of faking one.
 *
 * What IS here is the plain CLI case: a supervisor-managed process simply exits and
 * lets the supervisor bring it back, and an unsupervised one spawns a detached
 * helper that waits for the current process to release its port before launching
 * the same invocation again.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Recognise the supervisors that own restarts, so we never double-start a host. */
export function detectSupervisor (env = process.env) {
  if (env.INVOCATION_ID || env.JOURNAL_STREAM) return 'systemd'
  if (env.pm_id !== undefined || env.PM2_HOME) return 'pm2'
  if (env.XPC_SERVICE_NAME || env.LAUNCH_JOB_NAME) return 'launchd'
  return null
}

/**
 * Can this host restart itself, and if not, why not.
 * @param desktop - the official Desktop shell published its profile service.
 */
export function restartCapability (options = {}) {
  const env = options.env || process.env
  if (options.desktop === true) {
    return {
      supported: false,
      reason: 'DSH Desktop owns its own process lifecycle: restart it from the tray menu, or quit and reopen.',
    }
  }
  return { supported: true, supervisor: detectSupervisor(env) }
}

/** The helper waits for the port to be released instead of guessing at a delay. */
function helperSource (invocation, logPath) {
  return [
    "import { spawn } from 'node:child_process'",
    "import { createConnection } from 'node:net'",
    "import { appendFileSync } from 'node:fs'",
    'const target = ' + JSON.stringify(invocation) + '',
    'const log = ' + JSON.stringify(logPath) + '',
    'const note = (text) => { try { appendFileSync(log, new Date().toISOString() + " " + text + String.fromCharCode(10)) } catch {} }',
    'const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))',
    'async function free () {',
    '  if (target.port === null) return',
    '  for (let i = 0; i < 120; i++) {',
    '    const open = await new Promise((resolve) => {',
    '      const socket = createConnection({ host: "127.0.0.1", port: target.port })',
    '      socket.on("connect", () => { socket.destroy(); resolve(true) })',
    '      socket.on("error", () => resolve(false))',
    '    })',
    '    if (!open) return',
    '    await sleep(500)',
    '  }',
    '}',
    'await free()',
    'await sleep(300)',
    'const child = spawn(target.command, target.args, { detached: true, stdio: "ignore", cwd: target.cwd, env: process.env })',
    'child.unref()',
    'note("relaunched " + target.command + " pid=" + child.pid)',
    'process.exit(0)',
  ].join(String.fromCharCode(10))
}

/**
 * Hand the restart to a helper that outlives us, then stop this host.
 * The caller is responsible for answering the HTTP request first.
 */
export function scheduleRestart (options = {}) {
  const argv = options.argv || process.argv
  const execPath = options.execPath || process.execPath
  const cwd = options.cwd || process.cwd()
  const supervisor = options.supervisor === undefined ? detectSupervisor(options.env || process.env) : options.supervisor
  const port = typeof options.port === 'number' && options.port > 0 ? options.port : null

  if (supervisor !== null) {
    // A supervisor owns the lifecycle: exiting is the whole restart.
    return { mode: 'supervisor', supervisor, exit: () => process.exit(0) }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const helperPath = path.join(tmpdir(), 'dsh-plugin-autoupdate-restart-' + stamp + '.mjs')
  const logPath = path.join(tmpdir(), 'dsh-plugin-autoupdate-restart-' + stamp + '.log')
  const invocation = { command: execPath, args: argv.slice(1), cwd, port }
  try {
    writeFileSync(helperPath, helperSource(invocation, logPath), 'utf8')
  } catch (err) {
    return { mode: 'failed', reason: 'could not write the restart helper: ' + String((err && err.message) || err) }
  }
  const child = spawn(execPath, [helperPath], { detached: true, stdio: 'ignore', cwd })
  child.unref()
  return { mode: 'helper', helper: helperPath, log: logPath, pid: child.pid, exit: () => process.exit(0) }
}

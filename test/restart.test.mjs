import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSupervisor, restartCapability, scheduleRestart } from '../lib/restart.js'

test('Desktop is reported as unsupported, with the reason, and never respawned', () => {
  const capability = restartCapability({ desktop: true })
  assert.equal(capability.supported, false)
  assert.match(capability.reason, /Desktop|tray/i)
})

test('the Electron app process is refused even when no Desktop service is published', () => {
  // The regression that lit the button on the desktop build.
  const electron = restartCapability({ env: {}, versions: { electron: '44.0.0', node: '24.18.1' } })
  assert.equal(electron.supported, false)
  assert.match(electron.reason, /Desktop/)
  const scheduled = scheduleRestart({ env: {}, versions: { electron: '44.0.0' } })
  assert.equal(scheduled.mode, 'unsupported')
  assert.equal(scheduled.exit, undefined, 'nothing may exit the Electron process')
})

test('a CLI host running inside the Electron binary is NOT the app process', () => {
  const capability = restartCapability({ env: { ELECTRON_RUN_AS_NODE: '1' }, versions: { electron: '44.0.0' } })
  assert.equal(capability.supported, true)
})

test('a plain CLI host supports restart', () => {
  const capability = restartCapability({ desktop: false, env: {} })
  assert.equal(capability.supported, true)
  assert.equal(capability.supervisor, null)
})

test('supervisors are recognised so we never double-start a host', () => {
  assert.equal(detectSupervisor({ INVOCATION_ID: 'x' }), 'systemd')
  assert.equal(detectSupervisor({ pm_id: '0' }), 'pm2')
  assert.equal(detectSupervisor({ XPC_SERVICE_NAME: 'dsh' }), 'launchd')
  assert.equal(detectSupervisor({}), null)
})

test('under a supervisor the restart is just an exit', () => {
  const scheduled = scheduleRestart({ supervisor: 'systemd', argv: ['node', 'x'], execPath: 'node' })
  assert.equal(scheduled.mode, 'supervisor')
  assert.equal(scheduled.supervisor, 'systemd')
  assert.equal(typeof scheduled.exit, 'function')
})

test('without a supervisor it detaches a helper instead of exiting blind', () => {
  const scheduled = scheduleRestart({ supervisor: null, argv: [process.execPath, 'main.js'], execPath: process.execPath, port: null })
  assert.equal(scheduled.mode, 'helper')
  assert.match(scheduled.helper, /dsh-plugin-autoupdate-restart-.*\.mjs$/)
  assert.match(scheduled.log, /dsh-plugin-autoupdate-restart-.*\.log$/)
  assert.equal(typeof scheduled.exit, 'function')
})

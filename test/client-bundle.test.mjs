import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

/**
 * These assertions exist because the artifact shape is a hard runtime contract that
 * nothing else checks offline: an ESM bundle builds fine, passes every host test, and
 * then takes the whole desktop app down at boot with
 * "Cannot use import statement outside a module" (2026-10-09).
 */
function loadBundle () {
  const source = readFileSync(BUNDLE, 'utf8')
  const registered = []
  const window = { __ModuleLoader__: { load: (entry) => registered.push(entry) } }
  new Function('window', source)(window)
  return { source, registered }
}

const FAKE_REACT = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useState: (value) => [value, () => {}],
}

test('lib/client.js is a loader factory, not an ES module', () => {
  assert.ok(existsSync(BUNDLE), 'lib/client.js must be committed - git installs run no build')
  const { source } = loadBundle()
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(source, /id: "dsh-plugin-autoupdate"/)
  // The formatter may split the footer across lines; the sourceMappingURL comment
  // is the only thing allowed after it.
  const body = source.split('//# sourceMappingURL=')[0].trimEnd()
  assert.match(body, /return module\.exports;\s*\}\s*\}\);$/)
  assert.equal(/^\s*(import|export)\s/m.test(source), false, 'a classic script cannot carry import/export')
})

test('executing the bundle registers exactly one factory', () => {
  const { registered } = loadBundle()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, 'dsh-plugin-autoupdate')
  assert.equal(typeof registered[0].factory, 'function')
})

test('the factory resolves react through the injected require', () => {
  const { registered } = loadBundle()
  const asked = []
  const mod = registered[0].factory((specifier) => {
    asked.push(specifier)
    if (specifier === 'react' || specifier.startsWith('react/')) return FAKE_REACT
    throw new Error('unexpected require: ' + specifier)
  })
  assert.deepEqual(asked, ['react'])
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.PluginUpdatesPage, 'function')
})

test('apply() registers the settings.section page', () => {
  const { registered } = loadBundle()
  const mod = registered[0].factory(() => FAKE_REACT)
  const calls = []
  const ctx = {
    effect: (fn, label) => { calls.push(['effect', label]); return fn() },
    slots: {
      inject: (name, cb) => { calls.push(['inject', name]); return cb() },
      register: (options, component) => { calls.push(['register', options, component]); return () => {} },
    },
  }
  mod.apply(ctx)
  assert.equal(calls[0][0], 'effect')
  assert.deepEqual(calls[1], ['inject', 'settings.section'])
  const [, options, component] = calls[2]
  assert.equal(options.name, 'settings.section')
  assert.equal(options.id, 'plugin-autoupdate')
  assert.equal(typeof options.label, 'function', 'the shell CALLS label()')
  assert.equal(options.label(), '插件更新')
  assert.equal(component.name, 'PluginUpdatesPage')
})

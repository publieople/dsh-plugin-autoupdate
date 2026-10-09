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
  useRef: (value) => ({ current: value }),
}

/** Keys of one dictionary object literal, as the bundle ships it. */
function dictionaryKeys (source, name) {
  const start = source.indexOf('const ' + name + ' = {')
  assert.notEqual(start, -1, 'the bundle must carry the ' + name + ' dictionary')
  const body = source.slice(start, source.indexOf('};', start))
  // Keys carry digits too (error.catalog404, banner.hostOld1); values never look
  // like a dotted lowercase key followed by a colon.
  return [...body.matchAll(/"([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9.]+)":/g)].map((match) => match[1])
}

/** Keys the code actually asks for. Every call site passes a literal. */
function requestedKeys (source) {
  return [...source.matchAll(/translate\("([^"]+)"/g)].map((match) => match[1])
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
  assert.deepEqual(mod.inject, ['slots', 'locale'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.PluginUpdatesPage, 'function')
})

test('en mirrors zh key for key, and the dictionaries cover every key the code uses', () => {
  const { source } = loadBundle()
  const zhKeys = dictionaryKeys(source, 'zh')
  const enKeys = dictionaryKeys(source, 'en')
  assert.ok(zhKeys.length > 40, 'the zh dictionary is the key-set source of truth and must not shrink')
  assert.deepEqual([...enKeys].sort(), [...zhKeys].sort(), 'en must mirror zh key for key')
  const used = [...new Set(requestedKeys(source))]
  assert.deepEqual(used.filter((key) => !zhKeys.includes(key)), [], 'every translated key must exist in the dictionary')
  assert.deepEqual(zhKeys.filter((key) => !used.includes(key)), [], 'no dictionary key may be dead')
})

test('the page fills its seat and diagnoses a host older than itself', () => {
  const { source } = loadBundle()
  // The seat is AppFrame's centerCol: a column flex box with overflow:hidden. A
  // fixed page max-width left the whole page hugging the left edge on a wide
  // window and nothing scrolled, because the parent clips (user, 2026-10-09).
  assert.equal(/maxWidth:\s*"1100px"/.test(source), false, 'the page must not cap its own width')
  assert.match(source, /overflow: "auto"/, 'the page owns the scrolling the seat does not provide')
  // A 404 from a host started before this bundle must not read as "no data yet".
  assert.match(source, /translate\("error\.catalog404"\)/, 'the 404 branch must use the diagnosis copy')
  assert.match(source, /宿主没有 \/catalog 路由/)
  assert.match(source, /catalogTried\.current/, 'the catalog request must not retry in a loop')
})

test('apply() registers the main-column panel and its rail entry', () => {
  const { registered } = loadBundle()
  const mod = registered[0].factory(() => FAKE_REACT)
  const calls = []
  // No locale seat here on purpose: the page must still carry its copy through the
  // zh fallback instead of rendering keys or throwing.
  const ctx = {
    effect: (fn, label) => { calls.push(['effect', label]); return fn() },
    slots: {
      inject: (name, cb) => { calls.push(['inject', name]); return cb() },
      register: (options, component) => { calls.push(['register', options, component]); return () => {} },
    },
  }
  mod.apply(ctx)
  const injected = calls.filter((call) => call[0] === 'inject').map((call) => call[1])
  assert.deepEqual(injected, ['main', 'sidebar.panellist'])
  const registers = calls.filter((call) => call[0] === 'register')
  const main = registers.find((call) => call[1].name === 'main')
  assert.equal(main[1].key, 'plugin-autoupdate', 'the key is the panel id the rail selects')
  assert.equal(main[1].locale, 'plugin-autoupdate', 'the seat declares the namespace its copy comes from')
  assert.equal(main[2].name, 'PluginUpdatesPage')
  const rail = registers.find((call) => call[1].name === 'sidebar.panellist')
  assert.equal(rail[1].id, 'plugin-autoupdate')
  assert.equal(typeof rail[1].label, 'function', 'the rail CALLS label()')
  assert.equal(rail[1].label(), '插件更新', 'without a locale seat the zh dictionary is the fallback')
  assert.equal(rail[2].name, 'PluginUpdatesIcon')
})

test('apply() hands both dictionaries to the seat and the label follows it', () => {
  const { registered } = loadBundle()
  const mod = registered[0].factory(() => FAKE_REACT)
  const dicts = []
  const registers = []
  const subscriptions = []
  const ctx = {
    effect: (fn) => fn(),
    slots: {
      inject: (name, cb) => cb(),
      register: (options, component) => { registers.push([options, component]); return () => {} },
    },
    locale: {
      register: (namespace, dictionary) => { dicts.push([namespace, dictionary]); return () => {} },
      // A bound translator that names its namespace, so the assertions can see
      // which one the rail entry reads through.
      bind: (namespace) => (key) => namespace + ':' + key,
      subscribe: (listener) => { subscriptions.push(listener); return () => {} },
    },
  }
  mod.apply(ctx)
  assert.equal(dicts.length, 1, 'one namespace, one registration')
  assert.equal(dicts[0][0], 'plugin-autoupdate')
  assert.ok(Object.keys(dicts[0][1].zh).length > 40)
  assert.deepEqual(Object.keys(dicts[0][1].en).sort(), Object.keys(dicts[0][1].zh).sort())
  const rail = registers.find((call) => call[0].name === 'sidebar.panellist')
  assert.equal(rail[0].label(), 'plugin-autoupdate:nav.title', 'the label reads through the registered namespace')
})

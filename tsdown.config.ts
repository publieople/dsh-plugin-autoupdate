/**
 * Client build.
 *
 * The artifact is NOT an ES module. A DSH client bundle is a classic script that
 * registers a closure factory:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports } })
 *
 * The loader answers `require` from the web client's module table (React and the
 * @deepseek-ai client packages), so those specifiers stay external and everything
 * else is inlined. Shipping plain ESM here crashed the desktop app with
 * "Cannot use import statement outside a module" - see AGENTS.md.
 *
 * The host half (lib/index.js, lib/http.js, ...) is hand-written ESM that Node runs
 * directly, so `clean` stays false and this never touches it.
 */
import { defineConfig } from 'tsdown'

const ID = 'dsh-plugin-autoupdate'

/** Specifiers the loader module table answers; everything else is inlined. */
const EXTERNAL = [/^@deepseek-ai\//, /^react(-dom)?(\/|$)/]
const isExternal = (specifier) => EXTERNAL.some((rule) => rule.test(specifier))

/** Open the loader registration; the intro/footer close the CommonJS wrapper. */
const banner = (chunk) =>
  'window.__ModuleLoader__.load({ id: ' + JSON.stringify(ID) + ', '
  + (chunk.isEntry ? '' : 'chunk: ' + JSON.stringify(chunk.fileName) + ', ')
  + 'factory: (require) => {'

export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  clean: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: isExternal,
    alwaysBundle: (specifier) => !isExternal(specifier),
  },
  outputOptions: {
    // Pinned so the artifact is exactly lib/client.js - the path the host serves
    // and the one this package's exports map declares.
    entryFileNames: 'client.js',
    banner,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})

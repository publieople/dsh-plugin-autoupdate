import { defineConfig } from 'tsdown'

/**
 * Only the client half is built. The host half (lib/index.js, lib/http.js, ...)
 * is hand-written ESM that Node runs directly - a build step there would add a
 * toolchain for nothing, so `clean` stays false and this never touches lib/index.js.
 *
 * The browser runtime (react, the @deepseek-ai client table) is provided by the
 * host's module table at run time, so it must stay external.
 */
export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  clean: false,
  dts: false,
  deps: { neverBundle: [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime'] },

})

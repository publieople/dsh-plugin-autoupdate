import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogCategories, catalogRows, compactEntry, findCatalogSpec, installSpecFor, NPM_NAME } from '../lib/catalog.js'
import { listLocks, lockPackage, splitLocked, unlockPackage } from '../lib/state.js'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CATALOG = {
  categories: { dev: { en: 'Development', zh: '开发与运行时' } },
  plugins: [
    { name: 'dsh-alpha', npm: 'dsh-alpha', owner: 'a', category: 'dev', description: { en: 'Alpha tool', zh: '甲工具' }, version: '1.0.0', stars: 5, downloads: 100, capabilities: ['fs-read'] },
    { name: 'dsh-beta', npm: '@scope/dsh-beta', owner: 'b', category: 'dev', description: { en: 'Beta thing', zh: '乙东西' }, version: '2.0.0', stars: 50, downloads: 10 },
    { name: 'other-plugin', npm: 'other-plugin', owner: 'c', category: 'ui', description: { en: 'Unrelated', zh: '无关' }, stars: 1, downloads: 9999 },
  ],
}

test('a name hit outranks a description hit, then popularity decides', () => {
  const exact = catalogRows(CATALOG, { q: 'dsh-beta' })
  assert.deepEqual(exact.rows.map((r) => r.name), ['dsh-beta'])
  const loose = catalogRows(CATALOG, { q: 'tool' })
  assert.deepEqual(loose.rows.map((r) => r.name), ['dsh-alpha'])
  const all = catalogRows(CATALOG, {})
  assert.deepEqual(all.rows.map((r) => r.name), ['other-plugin', 'dsh-alpha', 'dsh-beta'], 'sorted by downloads')
})

test('category filter and limit apply', () => {
  assert.deepEqual(catalogRows(CATALOG, { category: 'dev' }).rows.map((r) => r.name), ['dsh-alpha', 'dsh-beta'])
  assert.equal(catalogRows(CATALOG, { limit: 1 }).rows.length, 1)
  assert.deepEqual(catalogCategories(CATALOG), [{ id: 'dev', en: 'Development', zh: '开发与运行时' }])
})

test('entries compact to the row shape the page renders', () => {
  const row = compactEntry(CATALOG.plugins[0])
  assert.equal(row.npm, 'dsh-alpha')
  assert.equal(row.stars, 5)
  assert.deepEqual(row.capabilities, ['fs-read'])
  assert.deepEqual(row.redLines, [])
})

test('the install spec never carries a version', () => {
  assert.equal(installSpecFor({ npm: 'dsh-alpha', version: '1.2.3' }), 'dsh-alpha')
  assert.equal(installSpecFor({ name: '@scope/x' }), '@scope/x')
  assert.equal(installSpecFor({ name: 'dsh-alpha@1.2.3' }), null, 'a pinned spec is refused')
  assert.equal(NPM_NAME.test('dsh-alpha@1.2.3'), false)
  assert.equal(NPM_NAME.test('github:owner/repo'), false)
  assert.equal(NPM_NAME.test('@scope/dsh-beta'), true)
})

test('only a package the catalog offers may be installed', () => {
  assert.equal(findCatalogSpec(CATALOG, 'dsh-alpha').name, 'dsh-alpha')
  assert.equal(findCatalogSpec(CATALOG, '@scope/dsh-beta').name, 'dsh-beta')
  assert.equal(findCatalogSpec(CATALOG, 'dsh-alpha@1.0.0'), null)
  assert.equal(findCatalogSpec(CATALOG, 'not-in-catalog'), null)
  assert.equal(findCatalogSpec(CATALOG, 'github:evil/repo'), null)
})

test('locks live in the profile directory and are the only thing written', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-'))
  assert.deepEqual(listLocks(dir), [])
  lockPackage(dir, { name: 'dsh-alpha', version: '1.0.0' }, () => '2026-10-09T00:00:00.000Z')
  lockPackage(dir, { name: 'dsh-beta' }, () => '2026-10-09T00:00:00.000Z')
  assert.deepEqual(listLocks(dir).map((l) => l.name), ['dsh-alpha', 'dsh-beta'])
  lockPackage(dir, { name: 'dsh-alpha', version: '1.0.1' }, () => '2026-10-09T00:00:01.000Z')
  assert.equal(listLocks(dir).length, 2, 're-locking replaces, never duplicates')
  assert.equal(listLocks(dir)[0].version, '1.0.1')
  unlockPackage(dir, 'dsh-alpha')
  assert.deepEqual(listLocks(dir).map((l) => l.name), ['dsh-beta'])
})

test('locked rows move out of the offer, never out of sight', () => {
  const report = { profile: 'desktop', rows: [{ name: 'a' }, { name: 'b' }] }
  const split = splitLocked(report, [{ name: 'a' }])
  assert.deepEqual(split.rows, [{ name: 'b' }])
  assert.deepEqual(split.lockedRows, [{ name: 'a' }])
  assert.equal(split.profile, 'desktop')
})

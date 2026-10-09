/**
 * The plugin catalog this page discovers from.
 *
 * Borrowed from the market, on its own word: dsh-market's regions.ts points at
 * `https://awesome-dsh-plugin.com/plugins.json` as the official catalog, and this
 * is that same file - 4000+ entries with per-entry categories, bilingual
 * descriptions, npm name, stars, downloads and capability annotations. We only
 * read it; the market keeps publishing it.
 *
 * Cached under $DSH_HOME so a page reload never re-downloads 5 MB, and so a
 * network failure degrades to the last good copy instead of an empty page.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dshHome } from './profiles.js'

export const CATALOG_URL = 'https://awesome-dsh-plugin.com/plugins.json'
export const CATALOG_TTL_MS = 12 * 60 * 60 * 1000

/** npm package names only: no version, no git URL, no shell metacharacters. */
export const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function catalogCachePath (home = dshHome()) {
  return path.join(home, '.plugin-autoupdate-catalog.json')
}

export function readCatalogCache (home = dshHome()) {
  const file = catalogCachePath(home)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || !Array.isArray(parsed.plugins)) return null
    return parsed
  } catch { return null }
}

export function writeCatalogCache (home, catalog, fetchedAt) {
  try { writeFileSync(catalogCachePath(home), JSON.stringify({ ...catalog, fetchedAt }), 'utf8') } catch { /* cache is best effort */ }
}

/**
 * The catalog, from cache when it is fresh, from the network otherwise. A failed
 * refresh keeps serving the stale copy and reports why, which is the difference
 * between an old page and a broken one.
 */
export async function fetchCatalog (options = {}) {
  const home = options.home || dshHome()
  const now = options.now || Date.now()
  const cached = readCatalogCache(home)
  const fresh = cached !== null && now - Number(cached.fetchedAt || 0) < CATALOG_TTL_MS
  if (fresh && options.force !== true) return { catalog: cached, fetchedAt: cached.fetchedAt, cached: true }
  try {
    const response = await (options.fetchImpl || fetch)(CATALOG_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs || 25000),
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const catalog = await response.json()
    writeCatalogCache(home, catalog, now)
    return { catalog: { ...catalog, fetchedAt: now }, fetchedAt: now, cached: false }
  } catch (err) {
    if (cached !== null) {
      return { catalog: cached, fetchedAt: cached.fetchedAt, cached: true, stale: true, error: String((err && err.message) || err) }
    }
    throw err
  }
}

/** One catalog entry, cut down to what a row renders. */
export function compactEntry (entry) {
  return {
    name: entry.name,
    npm: entry.npm || null,
    owner: entry.owner || null,
    url: entry.url || null,
    page: entry.page || null,
    category: entry.category || null,
    description: entry.description || {},
    version: entry.version || null,
    stars: Number(entry.stars) || 0,
    downloads: Number(entry.downloads) || 0,
    capabilities: Array.isArray(entry.capabilities) ? entry.capabilities : [],
    redLines: Array.isArray(entry.capabilityRedLines) ? entry.capabilityRedLines : [],
  }
}

/**
 * Filter + rank. With a query, a name hit always outranks a description hit;
 * without one, the ordering is by downloads then stars - the same popularity
 * signal the market shows.
 */
export function catalogRows (catalog, options = {}) {
  const query = String(options.q || '').trim().toLowerCase()
  const category = options.category ? String(options.category) : ''
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 40))
  const entries = (catalog && Array.isArray(catalog.plugins) ? catalog.plugins : []).map(compactEntry)
  const scored = []
  for (const entry of entries) {
    if (category !== '' && entry.category !== category) continue
    let score = 0
    if (query !== '') {
      const name = String(entry.name || '').toLowerCase()
      const npm = String(entry.npm || '').toLowerCase()
      const owner = String(entry.owner || '').toLowerCase()
      const zh = String((entry.description && entry.description.zh) || '')
      const en = String((entry.description && entry.description.en) || '').toLowerCase()
      if (name === query || npm === query) score = 100
      else if (name.startsWith(query) || npm.startsWith(query)) score = 80
      else if (name.includes(query) || npm.includes(query) || owner.includes(query)) score = 60
      else if (en.includes(query) || zh.includes(query)) score = 30
      else continue
    }
    scored.push({ entry, score })
  }
  scored.sort((a, b) => (b.score - a.score) || (b.entry.downloads - a.entry.downloads) || (b.entry.stars - a.entry.stars))
  return { total: scored.length, rows: scored.slice(0, limit).map((item) => item.entry) }
}

/** The category list the market publishes, for the filter control. */
export function catalogCategories (catalog) {
  const source = (catalog && catalog.categories) || {}
  return Object.keys(source).map((id) => ({ id, en: source[id].en || id, zh: source[id].zh || id }))
}

/**
 * The spec to install - deliberately without a version. Our own rule is that a
 * version never gets chosen here: `dsh plugin add name@1.2.3` is what writes a
 * minimumReleaseAgeExclude entry and bypasses the release-age gate.
 */
export function installSpecFor (entry) {
  const spec = entry.npm || entry.name
  return typeof spec === 'string' && NPM_NAME.test(spec) ? spec : null
}

/** Is this spec a package the catalog actually offers? Nothing else may be installed. */
export function findCatalogSpec (catalog, spec) {
  if (typeof spec !== 'string' || !NPM_NAME.test(spec)) return null
  const wanted = spec.toLowerCase()
  const entries = (catalog && Array.isArray(catalog.plugins) ? catalog.plugins : [])
  for (const entry of entries) {
    const candidates = [entry.npm, entry.name].filter((value) => typeof value === 'string')
    if (candidates.some((value) => value.toLowerCase() === wanted)) return compactEntry(entry)
  }
  return null
}

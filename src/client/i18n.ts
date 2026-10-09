/**
 * The page's translation surface.
 *
 * Same shape the neighbouring plugins use: register one namespace dictionary in
 * apply(), read it back through \`locale.bind(NS)\`, and re-render on a language
 * switch through \`locale.subscribe\`. The service is captured at apply() time
 * instead of imported, so this bundle keeps depending on nothing but React - the
 * client module table is what answers \`require\`, and a hard import of a client
 * package here would have to be externalised to stay resolvable.
 *
 * \`translate\` stays usable when the service is absent (unit tests, a host that
 * serves no locale seat): it then answers from the Chinese dictionary, which is the
 * key-set source of truth.
 */
import { zh } from './locales'

/** Dictionary namespace owned by this plugin; also the seat's \`locale\` field. */
export const NS = 'plugin-autoupdate'

type Translate = (key: string, params?: Record<string, string | number>) => string

interface LocaleService {
  bind: (namespace: string) => Translate
  subscribe?: (listener: () => void) => (() => void) | void
}

let service: LocaleService | null = null

/** Capture the client locale service. \`undefined\` (no seat) leaves the fallback in place. */
export function attachLocale (locale: unknown): void {
  const candidate = locale as LocaleService | undefined
  service = candidate && typeof candidate.bind === 'function' ? candidate : null
}

/** One key, in the reader's language. Unknown keys fall back to the zh dictionary. */
export function translate (key: string, params?: Record<string, string | number>): string {
  if (service !== null) {
    try {
      const text = service.bind(NS)(key, params)
      // A service without this namespace answers with the key itself; that is a
      // miss, not a translation, so fall through to the dictionary we ship.
      if (typeof text === 'string' && text !== '' && text !== key) return text
    } catch { /* fall through */ }
  }
  return fill(zh[key] === undefined ? key : zh[key], params)
}

/** Re-render hook for a language switch. Returns a disposer in every case. */
export function subscribeLocale (listener: () => void): () => void {
  if (service === null || typeof service.subscribe !== 'function') return () => {}
  try {
    const dispose = service.subscribe(listener)
    return typeof dispose === 'function' ? dispose : () => {}
  } catch { return () => {} }
}

/** \`{name}\` placeholders, the same ones the locale service fills in. */
function fill (text: string, params?: Record<string, string | number>): string {
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}

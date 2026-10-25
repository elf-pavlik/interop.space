// Pure matching helpers for linking W3C API specifications to Specref
// bibliography entries. The W3C API spec is the source of truth; Specref is
// only used to identify the corresponding bibliography record for now.

export interface SpecrefEntry {
  id: string
  title?: string
  authors?: string[]
  etAl?: boolean
  href?: string
  edDraft?: string
  date?: string
  rawDate?: string
  status?: string
  publisher?: string
  obsoletes?: string[]
  obsoletedBy?: string[]
  isbn?: string
  pages?: string
  repository?: string
  deliveredBy?: { url: string; shortname: string }[]
  aliasOf?: string
  versionOf?: string
  versions?: string[]
  isSeriesAlias?: boolean
  [key: string]: unknown
}

export interface MatchTarget {
  /** Canonical W3C API shortlink, also the catalog subject. */
  uri: string
  shortlink?: string
  editorDraft?: string
  shortname?: string
  title?: string
}

export type MatchKey = 'shortlink' | 'editorDraft' | 'shortname' | 'title'

export type MatchResult =
  | { status: 'matched'; key: MatchKey; entry: SpecrefEntry }
  | { status: 'collision'; key: MatchKey; candidates: SpecrefEntry[] }
  | { status: 'unmatched' }

export interface SpecrefIndexes {
  byHref: Map<string, SpecrefEntry[]>
  byEdDraft: Map<string, SpecrefEntry[]>
  byId: Map<string, SpecrefEntry[]>
  byTitle: Map<string, SpecrefEntry[]>
}

/**
 * Compare public URLs without scheme, `www.`, or trailing slashes.
 * Path case is preserved because W3C TR paths can be case-sensitive.
 */
export function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const port = url.port ? `:${url.port}` : ''
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${port}${path}${url.search}${url.hash}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

export function normalizeId(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

export function normalizeTitle(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized || undefined
}

function add(
  index: Map<string, SpecrefEntry[]>,
  key: string | undefined,
  entry: SpecrefEntry,
): void {
  if (!key) return
  const entries = index.get(key)
  if (entries) {
    entries.push(entry)
  } else {
    index.set(key, [entry])
  }
}

/**
 * Index canonical Specref entries. Aliases and version snapshots are skipped:
 * a W3C API specification is a series, so it should link to the canonical
 * bibliography entry, not to one of its generated aliases or dated versions.
 */
export function buildSpecrefIndexes(entries: SpecrefEntry[]): SpecrefIndexes {
  const indexes: SpecrefIndexes = {
    byHref: new Map(),
    byEdDraft: new Map(),
    byId: new Map(),
    byTitle: new Map(),
  }
  for (const entry of entries) {
    if (entry.aliasOf || entry.versionOf) continue
    add(indexes.byHref, normalizeUrl(entry.href), entry)
    add(indexes.byEdDraft, normalizeUrl(entry.edDraft), entry)
    add(indexes.byId, normalizeId(entry.id), entry)
    add(indexes.byTitle, normalizeTitle(entry.title), entry)
  }
  return indexes
}

/**
 * Try the keys in descending confidence order. A non-empty key is
 * authoritative: if it has multiple candidates, report a collision instead of
 * falling through to a weaker key.
 */
export function matchSpec(
  target: MatchTarget,
  indexes: SpecrefIndexes,
): MatchResult {
  const attempts: Array<{
    key: MatchKey
    value: string | undefined
    normalize: (value: string | undefined) => string | undefined
    index: Map<string, SpecrefEntry[]>
  }> = [
    {
      key: 'shortlink',
      value: target.shortlink ?? target.uri,
      normalize: normalizeUrl,
      index: indexes.byHref,
    },
    {
      key: 'editorDraft',
      value: target.editorDraft,
      normalize: normalizeUrl,
      index: indexes.byEdDraft,
    },
    {
      key: 'shortname',
      value: target.shortname,
      normalize: normalizeId,
      index: indexes.byId,
    },
    {
      key: 'title',
      value: target.title,
      normalize: normalizeTitle,
      index: indexes.byTitle,
    },
  ]

  for (const attempt of attempts) {
    const key = attempt.normalize(attempt.value)
    if (!key) continue
    const candidates = attempt.index.get(key)
    if (!candidates || candidates.length === 0) continue
    if (candidates.length === 1) {
      return { status: 'matched', key: attempt.key, entry: candidates[0]! }
    }
    return { status: 'collision', key: attempt.key, candidates: [...candidates] }
  }

  return { status: 'unmatched' }
}

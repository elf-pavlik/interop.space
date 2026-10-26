// Resolve rendered reference links to catalog specification subjects. Only W3C
// TR targets that already exist in the catalog are kept; everything else is
// reported so an expanding catalog can pick it up on a later run.

import { normalizeUrl } from '../specref/matching.ts'
import type {
  CatalogSpec,
  Citation,
  ExtractedReference,
} from './types.ts'
import {
  cleanUrl,
  isTrUrl,
  shortlinkFromDatedTrUrl,
  shortnameFromSpecUri,
  trKey,
} from './urls.ts'

export interface CatalogIndex {
  byUrl: Map<string, CatalogSpec>
  byShortname: Map<string, CatalogSpec>
}

export interface UnresolvedReference {
  key: string
  reason: string
}

export interface SkippedReference {
  key: string
  url: string
}

export interface ResolutionResult {
  citations: Citation[]
  nonW3c: SkippedReference[]
  outOfCatalog: SkippedReference[]
  unresolved: UnresolvedReference[]
  selfReferences: string[]
  duplicates: number
}

export function buildCatalogIndex(specs: CatalogSpec[]): CatalogIndex {
  const byUrl = new Map<string, CatalogSpec>()
  const byShortname = new Map<string, CatalogSpec>()
  for (const spec of specs) {
    const url = cleanUrl(spec.uri)
    const key = url ? normalizeUrl(url) : undefined
    if (key && !byUrl.has(key)) byUrl.set(key, spec)

    const shortname = (spec.shortname ?? shortnameFromSpecUri(spec.uri))
      ?.trim()
      .toLowerCase()
    if (shortname && !byShortname.has(shortname)) {
      byShortname.set(shortname, spec)
    }
  }
  return { byUrl, byShortname }
}

function matchTarget(
  index: CatalogIndex,
  url: string,
): CatalogSpec | undefined {
  const key = trKey(url)
  if (!key) return undefined
  const direct = index.byUrl.get(key)
  if (direct) return direct

  const shortlink = shortlinkFromDatedTrUrl(url)
  if (!shortlink) return undefined
  const fromShortlink = index.byUrl.get(normalizeUrl(shortlink) ?? '')
  if (fromShortlink) return fromShortlink
  const shortname = shortnameFromSpecUri(shortlink)?.toLowerCase()
  return shortname ? index.byShortname.get(shortname) : undefined
}

export function resolveReferences(
  source: CatalogSpec,
  references: ExtractedReference[],
  index: CatalogIndex,
): ResolutionResult {
  const citations: Citation[] = []
  const nonW3c: SkippedReference[] = []
  const outOfCatalog: SkippedReference[] = []
  const unresolved: UnresolvedReference[] = []
  const selfReferences: string[] = []
  const seen = new Set<string>()
  let duplicates = 0

  for (const reference of references) {
    if (!reference.targetUrl) {
      unresolved.push({ key: reference.key, reason: 'no link in entry' })
      continue
    }

    const url = cleanUrl(reference.targetUrl)
    if (!url) {
      unresolved.push({ key: reference.key, reason: 'invalid URL' })
      continue
    }

    if (!isTrUrl(url)) {
      nonW3c.push({ key: reference.key, url })
      continue
    }

    const target = matchTarget(index, url)
    if (!target) {
      outOfCatalog.push({ key: reference.key, url })
      continue
    }

    if (target.uri === source.uri) {
      selfReferences.push(reference.key)
      continue
    }

    const id = `${reference.nature}\u0000${target.uri}`
    if (seen.has(id)) {
      duplicates += 1
      continue
    }
    seen.add(id)
    citations.push({
      source: source.uri,
      target: target.uri,
      nature: reference.nature,
      key: reference.key,
    })
  }

  return {
    citations,
    nonW3c,
    outOfCatalog,
    unresolved,
    selfReferences,
    duplicates,
  }
}

import { resolveAuthorOverride } from './author-map.ts'
import { normalizePersonName } from './names.ts'

export interface PersonRef {
  uri: string
  name: string
}

export interface AuthorResolution {
  status: 'matched' | 'override' | 'unmatched' | 'ambiguous'
  uri?: string
  candidates?: string[]
}

/** Normalized name -> person subjects with that exact name. */
export type PersonNameIndex = Map<string, string[]>

export function buildPersonNameIndex(
  people: PersonRef[],
): PersonNameIndex {
  const index: PersonNameIndex = new Map()
  for (const person of people) {
    const key = normalizePersonName(person.name)
    if (!key) continue
    const existing = index.get(key)
    if (existing) {
      if (!existing.includes(person.uri)) existing.push(person.uri)
    } else {
      index.set(key, [person.uri])
    }
  }
  return index
}

/**
 * Exact normalized-name match first. A unique person wins; ambiguous or missing
 * names consult the manual map; otherwise the author remains a literal.
 */
export function resolveAuthor(
  specrefId: string,
  name: string,
  index: Readonly<PersonNameIndex>,
): AuthorResolution {
  const candidates = index.get(normalizePersonName(name)) ?? []
  if (candidates.length === 1) {
    return { status: 'matched', uri: candidates[0]! }
  }

  const override = resolveAuthorOverride(specrefId, name)
  if (override) {
    return { status: 'override', uri: override }
  }

  if (candidates.length > 1) {
    return { status: 'ambiguous', candidates: [...candidates] }
  }
  return { status: 'unmatched' }
}

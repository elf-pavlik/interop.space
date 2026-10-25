// Link W3C API specifications to canonical Specref entries and build the RDF
// for the chosen Specref metadata. This module is shared by the standalone
// linker and the Temporal crawl activity.

import type { Quad } from 'n3'
import {
  resolveAuthor,
  type AuthorResolution,
  type PersonNameIndex,
} from './authors.ts'
import { resolveKnownSpecrefException } from './exceptions.ts'
import {
  buildSpecrefIndexes,
  matchSpec,
  normalizeId,
  type MatchKey,
  type SpecrefEntry,
} from './matching.ts'
import { buildSpecrefQuads } from './metadata.ts'

export interface LinkTarget {
  /** Canonical W3C API shortlink, also the catalog subject. */
  uri: string
  shortlink?: string
  editorDraft?: string
  shortname?: string
  title?: string
  /** W3C API self link, used for the explicit exception map. */
  apiUrl?: string
}

export type ResolutionKey = MatchKey | 'exception'

export interface LinkMatch<T extends LinkTarget> {
  key: ResolutionKey
  entry: SpecrefEntry
  target: T
}

export interface LinkCollision<T extends LinkTarget> {
  key: MatchKey
  target: T
  candidates: SpecrefEntry[]
}

export interface AuthorReport<T extends LinkTarget> {
  target: T
  specrefId: string
  name: string
  status: AuthorResolution['status']
  uri?: string
  candidates?: string[]
}

export interface LinkOptions {
  /** Person-name index used to resolve Specref author literals to people. */
  authorIndex?: Readonly<PersonNameIndex>
}

export interface LinkResult<T extends LinkTarget> {
  matches: LinkMatch<T>[]
  collisions: LinkCollision<T>[]
  unmatched: T[]
  quads: Quad[]
  byKey: Record<ResolutionKey, number>
  authors: AuthorReport<T>[]
}

/**
 * Resolve every target at most once. Explicit exceptions are checked before
 * the normal shortlink/edDraft/shortname/title precedence.
 */
export function linkSpecifications<T extends LinkTarget>(
  targets: T[],
  entries: SpecrefEntry[],
  options: LinkOptions = {},
): LinkResult<T> {
  const indexes = buildSpecrefIndexes(entries)
  const matches: LinkMatch<T>[] = []
  const collisions: LinkCollision<T>[] = []
  const unmatched: T[] = []
  const quads: Quad[] = []
  const authors: AuthorReport<T>[] = []
  const byKey: Record<ResolutionKey, number> = {
    shortlink: 0,
    editorDraft: 0,
    shortname: 0,
    title: 0,
    exception: 0,
  }

  const addSpecrefQuads = (target: T, entry: SpecrefEntry): void => {
    const authorLinks = new Map<string, string>()
    if (options.authorIndex) {
      for (const name of entry.authors ?? []) {
        const resolution = resolveAuthor(entry.id, name, options.authorIndex)
        authors.push({
          target,
          specrefId: entry.id,
          name,
          ...resolution,
        })
        if (resolution.uri) authorLinks.set(name, resolution.uri)
      }
    }
    quads.push(...buildSpecrefQuads(target.uri, entry, authorLinks))
  }

  for (const target of targets) {
    const exceptionId = resolveKnownSpecrefException(target.apiUrl)
    const exceptionKey = exceptionId ? normalizeId(exceptionId) : undefined
    const exception = exceptionKey
      ? indexes.byId.get(exceptionKey)?.[0]
      : undefined

    if (exception) {
      byKey.exception += 1
      matches.push({ key: 'exception', entry: exception, target })
      addSpecrefQuads(target, exception)
      continue
    }

    const result = matchSpec(
      {
        uri: target.uri,
        shortlink: target.shortlink,
        editorDraft: target.editorDraft,
        shortname: target.shortname,
        title: target.title,
      },
      indexes,
    )

    if (result.status === 'matched') {
      byKey[result.key] += 1
      matches.push({ key: result.key, entry: result.entry, target })
      addSpecrefQuads(target, result.entry)
    } else if (result.status === 'collision') {
      collisions.push({
        key: result.key,
        target,
        candidates: result.candidates,
      })
    } else {
      unmatched.push(target)
    }
  }

  return { matches, collisions, unmatched, quads, byKey, authors }
}

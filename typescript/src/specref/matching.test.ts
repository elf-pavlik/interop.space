import { describe, expect, test } from 'bun:test'
import {
  buildSpecrefIndexes,
  matchSpec,
  normalizeTitle,
  normalizeUrl,
  type SpecrefEntry,
} from './matching.ts'

const entries: SpecrefEntry[] = [
  {
    id: 'by-href',
    title: 'By href',
    href: 'https://www.w3.org/TR/example/',
  },
  {
    id: 'by-editor-draft',
    title: 'By editor draft',
    edDraft: 'https://example.org/ed/',
  },
  {
    id: 'by-id',
    title: 'By id',
  },
  {
    id: 'by-title',
    title: 'A  Title With   Spaces',
  },
]

const indexes = buildSpecrefIndexes(entries)

describe('normalizeUrl', () => {
  test('ignores scheme, www, and trailing slashes', () => {
    expect(normalizeUrl('https://www.w3.org/TR/example/')).toBe(
      normalizeUrl('http://w3.org/TR/example'),
    )
  })

  test('preserves path case', () => {
    expect(normalizeUrl('https://www.w3.org/TR/PNG/')).not.toBe(
      normalizeUrl('https://www.w3.org/TR/png/'),
    )
  })

  test('keeps query and fragment', () => {
    expect(normalizeUrl('https://example.org/spec/?v=1#intro')).toBe(
      'example.org/spec?v=1#intro',
    )
  })
})

describe('normalizeTitle', () => {
  test('collapses whitespace and ignores case', () => {
    expect(normalizeTitle('A  Title With   Spaces')).toBe(
      'a title with spaces',
    )
  })
})

describe('matchSpec', () => {
  test('prefers shortlink/href', () => {
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/example/',
        shortlink: 'https://www.w3.org/TR/example/',
        shortname: 'by-id',
        title: 'By id',
      },
      indexes,
    )
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.key).toBe('shortlink')
      expect(result.entry.id).toBe('by-href')
    }
  })

  test('falls back to editor draft', () => {
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/other/',
        editorDraft: 'https://example.org/ed/',
        shortname: 'by-id',
      },
      indexes,
    )
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.key).toBe('editorDraft')
      expect(result.entry.id).toBe('by-editor-draft')
    }
  })

  test('falls back to shortname/id', () => {
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/other/',
        shortname: 'BY-ID',
        title: 'No such title',
      },
      indexes,
    )
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.key).toBe('shortname')
      expect(result.entry.id).toBe('by-id')
    }
  })

  test('falls back to normalized title', () => {
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/other/',
        title: 'A title with spaces',
      },
      indexes,
    )
    expect(result.status).toBe('matched')
    if (result.status === 'matched') {
      expect(result.key).toBe('title')
      expect(result.entry.id).toBe('by-title')
    }
  })

  test('reports a collision and does not fall through to a weaker key', () => {
    const collisionIndexes = buildSpecrefIndexes([
      { id: 'one', href: 'https://www.w3.org/TR/collision/' },
      { id: 'two', href: 'http://w3.org/TR/collision' },
      { id: 'fallback', title: 'Fallback' },
    ])
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/collision/',
        shortlink: 'https://www.w3.org/TR/collision/',
        title: 'Fallback',
      },
      collisionIndexes,
    )
    expect(result.status).toBe('collision')
    if (result.status === 'collision') {
      expect(result.key).toBe('shortlink')
      expect(result.candidates.map((candidate) => candidate.id).sort()).toEqual([
        'one',
        'two',
      ])
    }
  })

  test('reports the known W3C shortlink collisions', () => {
    const known = buildSpecrefIndexes([
      { id: 'uievents', href: 'https://www.w3.org/TR/uievents/' },
      { id: 'uievents-old', href: 'https://www.w3.org/TR/uievents/' },
      { id: 'PNG-1', href: 'https://www.w3.org/TR/PNG/' },
      { id: 'PNG-2', href: 'https://www.w3.org/TR/PNG/' },
      {
        id: 'performance-timeline',
        href: 'https://www.w3.org/TR/performance-timeline/',
      },
      {
        id: 'performance-timeline-1',
        href: 'https://www.w3.org/TR/performance-timeline/',
      },
    ])
    for (const uri of [
      'https://www.w3.org/TR/uievents/',
      'https://www.w3.org/TR/PNG/',
      'https://www.w3.org/TR/performance-timeline/',
    ]) {
      const result = matchSpec({ uri }, known)
      expect(result.status).toBe('collision')
      if (result.status === 'collision') {
        expect(result.candidates).toHaveLength(2)
      }
    }
  })

  test('returns unmatched when no key matches', () => {
    const result = matchSpec(
      {
        uri: 'https://www.w3.org/TR/missing/',
        shortname: 'missing',
        title: 'Missing',
      },
      indexes,
    )
    expect(result.status).toBe('unmatched')
  })

  test('skips aliases and version snapshots', () => {
    const canonicalOnly = buildSpecrefIndexes([
      { id: 'alias', aliasOf: 'target', href: 'https://example.org/alias/' },
      { id: 'version', versionOf: 'target', href: 'https://example.org/version/' },
    ])
    expect(
      matchSpec({ uri: 'https://example.org/alias/' }, canonicalOnly).status,
    ).toBe('unmatched')
    expect(
      matchSpec({ uri: 'https://example.org/version/' }, canonicalOnly).status,
    ).toBe('unmatched')
  })
})

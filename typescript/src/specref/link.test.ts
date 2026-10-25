import { describe, expect, test } from 'bun:test'
import { resolveKnownSpecrefException } from './exceptions.ts'
import { linkSpecifications, type LinkTarget } from './link.ts'
import type { SpecrefEntry } from './matching.ts'

const entries: SpecrefEntry[] = [
  {
    id: 'uievents',
    title: 'UI Events',
    authors: ['Xiaoqian Wu'],
    etAl: false,
    href: 'https://www.w3.org/TR/uievents/',
    edDraft: 'https://w3c.github.io/uievents/',
    date: '21 February 2026',
    status: 'WD',
    publisher: 'W3C',
    obsoletes: ['uievents-20060413'],
    obsoletedBy: ['uievents-20260221'],
    repository: 'https://github.com/w3c/uievents',
    versions: ['uievents-20260221'],
  },
  {
    id: 'PNG-1',
    title: 'Portable Network Graphics (PNG) Specification (Second Edition)',
    href: 'https://www.w3.org/TR/PNG/',
    status: 'REC',
    publisher: 'W3C',
  },
  {
    id: 'performance-timeline',
    title: 'Performance Timeline',
    href: 'https://www.w3.org/TR/performance-timeline/',
    status: 'CRD',
    publisher: 'W3C',
  },
  {
    id: 'activitypub',
    title: 'ActivityPub',
    href: 'https://www.w3.org/TR/activitypub/',
    status: 'REC',
    publisher: 'W3C',
  },
]

const predicates = (quads: ReturnType<typeof linkSpecifications>['quads']) =>
  new Set(quads.map((item) => item.predicate.value))

describe('resolveKnownSpecrefException', () => {
  test('maps both API records in each of the three shared-shortlink pairs', () => {
    expect(
      resolveKnownSpecrefException('https://api.w3.org/specifications/uievents'),
    ).toBe('uievents')
    expect(
      resolveKnownSpecrefException(
        'https://api.w3.org/specifications/uievents-old',
      ),
    ).toBe('uievents')
    expect(
      resolveKnownSpecrefException('https://api.w3.org/specifications/png-1'),
    ).toBe('PNG-1')
    expect(
      resolveKnownSpecrefException('https://api.w3.org/specifications/png-2'),
    ).toBe('PNG-1')
    expect(
      resolveKnownSpecrefException(
        'https://api.w3.org/specifications/performance-timeline',
      ),
    ).toBe('performance-timeline')
    expect(
      resolveKnownSpecrefException(
        'https://api.w3.org/specifications/performance-timeline-1',
      ),
    ).toBe('performance-timeline')
  })

  test('does not affect unrelated API records', () => {
    expect(
      resolveKnownSpecrefException('https://api.w3.org/specifications/activitypub'),
    ).toBeUndefined()
  })
})

describe('linkSpecifications', () => {
  test('uses an explicit exception and imports metadata', () => {
    const target: LinkTarget = {
      uri: 'https://www.w3.org/TR/uievents/',
      shortlink: 'https://www.w3.org/TR/uievents/',
      apiUrl: 'https://api.w3.org/specifications/uievents-old',
      shortname: 'uievents-old',
      title: 'UI Events',
    }
    const result = linkSpecifications([target], entries)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.key).toBe('exception')
    expect(result.matches[0]?.entry.id).toBe('uievents')
    expect(result.byKey.exception).toBe(1)

    const found = predicates(result.quads)
    expect(found).toContain('http://example.org#specrefId')
    expect(found).toContain('http://purl.org/dc/terms/title')
    expect(found).toContain('http://purl.org/dc/terms/creator')
    expect(found).toContain('http://purl.org/ontology/bibo/status')
    expect(found).toContain('https://w3id.org/specref/edDraft')
    expect(found).toContain('https://schema.org/codeRepository')

    // Versions and group membership are deliberately out of scope.
    expect(found).not.toContain('http://purl.org/dc/terms/hasVersion')
    expect(found).not.toContain('http://example.org#deliveredBy')
  })

  test('normal shortlink matching also imports metadata', () => {
    const target: LinkTarget = {
      uri: 'https://www.w3.org/TR/activitypub/',
      shortlink: 'https://www.w3.org/TR/activitypub/',
      apiUrl: 'https://api.w3.org/specifications/activitypub',
      shortname: 'activitypub',
      title: 'ActivityPub',
    }
    const result = linkSpecifications([target], entries)
    expect(result.matches[0]?.key).toBe('shortlink')
    expect(result.matches[0]?.entry.id).toBe('activitypub')
    expect(predicates(result.quads)).toContain(
      'http://purl.org/dc/terms/title',
    )
  })

  test('applies the PNG exception to PNG-2', () => {
    const target: LinkTarget = {
      uri: 'https://www.w3.org/TR/PNG/',
      shortlink: 'https://www.w3.org/TR/PNG/',
      apiUrl: 'https://api.w3.org/specifications/png-2',
      shortname: 'png-2',
      title: 'PNG',
    }
    const result = linkSpecifications([target], entries)
    expect(result.matches[0]?.key).toBe('exception')
    expect(result.matches[0]?.entry.id).toBe('PNG-1')
  })

  test('leaves collisions unresolved', () => {
    const collisionEntries: SpecrefEntry[] = [
      { id: 'one', href: 'https://example.org/shared/' },
      { id: 'two', href: 'https://example.org/shared/' },
    ]
    const result = linkSpecifications(
      [{ uri: 'https://example.org/shared/' }],
      collisionEntries,
    )
    expect(result.matches).toHaveLength(0)
    expect(result.collisions).toHaveLength(1)
    expect(result.quads).toHaveLength(0)
  })
})

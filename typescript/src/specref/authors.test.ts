import { describe, expect, test } from 'bun:test'
import {
  buildPersonNameIndex,
  resolveAuthor,
  type PersonRef,
} from './authors.ts'
import { resolveAuthorOverride } from './author-map.ts'
import { linkSpecifications } from './link.ts'
import type { SpecrefEntry } from './matching.ts'
import { normalizePersonName } from './names.ts'

const people: PersonRef[] = [
  { uri: 'urn:w3c:person:1', name: 'Alice Smith' },
  { uri: 'urn:w3c:person:2', name: 'Bob Jones' },
  { uri: 'urn:w3c:person:3', name: 'Same Name' },
  { uri: 'urn:w3c:person:4', name: 'Same  Name' },
]
const index = buildPersonNameIndex(people)

describe('normalizePersonName', () => {
  test('collapses whitespace and ignores case', () => {
    expect(normalizePersonName('  Alice   Smith  ')).toBe('alice smith')
  })
})

describe('resolveAuthor', () => {
  test('resolves a unique exact name', () => {
    expect(resolveAuthor('spec', 'Alice Smith', index)).toEqual({
      status: 'matched',
      uri: 'urn:w3c:person:1',
    })
  })

  test('reports ambiguous names', () => {
    const result = resolveAuthor('spec', 'Same Name', index)
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') {
      expect(result.candidates?.sort()).toEqual([
        'urn:w3c:person:3',
        'urn:w3c:person:4',
      ])
    }
  })

  test('reports unmatched names', () => {
    expect(resolveAuthor('spec', 'Nobody Here', index).status).toBe('unmatched')
  })

  test('has no manual override for an unverified name', () => {
    expect(resolveAuthorOverride('spec', 'Alice Smith')).toBeUndefined()
  })

  test('has the verified Pierre-Antoine Champin canonical override', () => {
    expect(resolveAuthorOverride('json-ld11', 'Pierre-Antoine Champin')).toBe(
      'urn:w3c:person:129656',
    )
  })

  test('has the four verified spec-specific overrides', () => {
    expect(
      resolveAuthorOverride('activitypub', 'Christopher Webber'),
    ).toBe('urn:w3c:person:57007')
    expect(resolveAuthorOverride('did-use-cases', 'Ryan Grant')).toBe(
      'urn:w3c:person:101398',
    )
    expect(resolveAuthorOverride('wot-profile', 'Tomoaki Mizushima')).toBe(
      'urn:w3c:person:98915',
    )
    expect(resolveAuthorOverride('wot-usecases', 'Tomoaki Mizushima')).toBe(
      'urn:w3c:person:98915',
    )
  })
})

describe('author metadata', () => {
  test('uses person IRIs for matches and literals for failures', () => {
    const entry: SpecrefEntry = {
      id: 'example',
      title: 'Example',
      href: 'https://example.org/spec/',
      authors: ['Alice Smith', 'Nobody Here'],
    }
    const result = linkSpecifications(
      [{ uri: 'https://example.org/spec/' }],
      [entry],
      { authorIndex: index },
    )
    expect(result.authors).toHaveLength(2)
    expect(result.authors.map((author) => author.status)).toEqual([
      'matched',
      'unmatched',
    ])
    const creators = result.quads.filter(
      (item) => item.predicate.value === 'http://purl.org/dc/terms/creator',
    )
    expect(creators).toHaveLength(2)
    expect(creators[0]?.object.termType).toBe('NamedNode')
    expect(creators[0]?.object.value).toBe('urn:w3c:person:1')
    expect(creators[1]?.object.termType).toBe('Literal')
    expect(creators[1]?.object.value).toBe('Nobody Here')
  })
})

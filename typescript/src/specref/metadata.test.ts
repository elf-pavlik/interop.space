import { describe, expect, test } from 'bun:test'
import {
  SPECREF_METADATA_PREDICATES,
  buildSpecrefQuads,
  specrefMetadataDeleteUpdate,
} from './metadata.ts'

describe('specrefMetadataDeleteUpdate', () => {
  test('clears all known metadata predicates for the given subjects', () => {
    const update = specrefMetadataDeleteUpdate([
      'https://www.w3.org/TR/example/',
    ])
    expect(update).toContain('VALUES ?s { <https://www.w3.org/TR/example/> }')
    for (const predicate of SPECREF_METADATA_PREDICATES) {
      expect(update).toContain(`<${predicate}>`)
    }
  })

  test('is empty without subjects', () => {
    expect(specrefMetadataDeleteUpdate([])).toBe('')
  })
})

describe('buildSpecrefQuads', () => {
  test('links resolved authors and keeps failures literal', () => {
    const quads = buildSpecrefQuads(
      'https://www.w3.org/TR/example/',
      {
        id: 'example',
        title: 'Example',
        authors: ['Resolved Person', 'Unresolved Person'],
      },
      new Map([['Resolved Person', 'urn:w3c:person:123']]),
    )
    const creators = quads.filter(
      (item) => item.predicate.value === 'http://purl.org/dc/terms/creator',
    )
    expect(creators.map((item) => item.object.termType)).toEqual([
      'NamedNode',
      'Literal',
    ])
    expect(creators[0]?.object.value).toBe('urn:w3c:person:123')
    expect(creators[1]?.object.value).toBe('Unresolved Person')
  })
})

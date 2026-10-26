import { describe, expect, test } from 'bun:test'
import {
  CITATION_PREDICATES,
  INFORMATIVE_REF,
  NORMATIVE_REF,
  buildCitationQuads,
  citationDeleteUpdate,
} from './build.ts'

describe('buildCitationQuads', () => {
  test('emits one edge per citation with the nature predicate', () => {
    const quads = buildCitationQuads([
      {
        source: 'https://www.w3.org/TR/did-core/',
        target: 'https://www.w3.org/TR/json-ld11/',
        nature: 'normative',
        key: 'JSON-LD11',
      },
      {
        source: 'https://www.w3.org/TR/did-core/',
        target: 'https://www.w3.org/TR/vc-data-model-2.0/',
        nature: 'informative',
        key: 'VC-DATA-MODEL',
      },
    ])

    expect(quads).toHaveLength(2)
    expect(quads[0]?.predicate.value).toBe(NORMATIVE_REF)
    expect(quads[1]?.predicate.value).toBe(INFORMATIVE_REF)
    expect(quads[0]?.subject.value).toBe('https://www.w3.org/TR/did-core/')
    expect(quads[0]?.object.value).toBe('https://www.w3.org/TR/json-ld11/')
  })
})

describe('citationDeleteUpdate', () => {
  test('clears only the citation predicates for the given subjects', () => {
    const update = citationDeleteUpdate([
      'https://www.w3.org/TR/did-core/',
      'https://www.w3.org/TR/json-ld11/',
    ])
    expect(update).toContain(
      'VALUES ?s { <https://www.w3.org/TR/did-core/> <https://www.w3.org/TR/json-ld11/> }',
    )
    for (const predicate of CITATION_PREDICATES) {
      expect(update).toContain(`<${predicate}>`)
    }
    expect(update).not.toContain('bibo')
  })

  test('is empty without subjects', () => {
    expect(citationDeleteUpdate([])).toBe('')
  })
})

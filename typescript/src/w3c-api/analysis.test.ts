import { describe, expect, test } from 'bun:test'
import {
  buildEditorQuads,
  buildParticipantQuads,
  buildStartPersonQuads,
  personUrn,
  type W3cGroupRef,
  type W3cSpecification,
} from './analysis.ts'

const EX = 'http://example.org#'

describe('personUrn', () => {
  test('uses the numeric W3C user id', () => {
    expect(personUrn(46577)).toBe('urn:w3c:person:46577')
  })

  test('rewrites duplicate W3C ids to the canonical account', () => {
    expect(personUrn(42931)).toBe('urn:w3c:person:129656')
  })
})

describe('buildStartPersonQuads', () => {
  test('uses the URN subject and keeps the W3C API URL', () => {
    const quads = buildStartPersonQuads({
      name: 'Test Person',
      githubId: '123',
      githubUsername: 'test',
      w3cId: 46577,
      w3cApiUrl: 'https://api.w3.org/users/opaque',
    })
    const subject = quads[0]?.subject.value
    expect(subject).toBe('urn:w3c:person:46577')
    const predicates = new Set(quads.map((item) => item.predicate.value))
    expect(predicates).toContain(`${EX}w3cApiUrl`)
    expect(predicates).toContain(`${EX}siloId`)
    expect(predicates).toContain(`${EX}name`)
  })
})

describe('buildParticipantQuads', () => {
  test('links group members to the person URN', () => {
    const group: W3cGroupRef = {
      uri: 'https://www.w3.org/groups/wg/example/',
      apiUrl: 'https://api.w3.org/groups/wg/example',
      id: 1,
      name: 'Example Working Group',
    }
    const quads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 46577,
              href: 'https://api.w3.org/users/opaque',
              name: 'Test Person',
              githubId: '123',
              githubUsername: 'test',
            },
          ],
        },
      ],
      new Set(),
    )
    const member = quads.find((item) => item.predicate.value === `${EX}member`)
    expect(member?.object.value).toBe('urn:w3c:person:46577')
    const person = quads.find(
      (item) =>
        item.subject.value === 'urn:w3c:person:46577' &&
        item.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    )
    expect(person?.object.value).toBe(`${EX}Person`)
    const apiUrl = quads.find(
      (item) =>
        item.subject.value === 'urn:w3c:person:46577' &&
        item.predicate.value === `${EX}w3cApiUrl`,
    )
    expect(apiUrl?.object.value).toBe('https://api.w3.org/users/opaque')
  })
})

describe('known seed people', () => {
  test('keep their seed properties while still joining groups', () => {
    const group: W3cGroupRef = {
      uri: 'https://www.w3.org/groups/wg/example/',
      apiUrl: 'https://api.w3.org/groups/wg/example',
      id: 1,
      name: 'Example Working Group',
    }
    const quads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 46577,
              href: 'https://api.w3.org/users/opaque',
              name: 'Participant Name',
            },
          ],
        },
      ],
      new Set([46577]),
    )
    expect(
      quads.find((item) => item.predicate.value === `${EX}member`)?.object.value,
    ).toBe('urn:w3c:person:46577')
    expect(
      quads.some(
        (item) =>
          item.subject.value === 'urn:w3c:person:46577' &&
          item.predicate.value === `${EX}name`,
      ),
    ).toBe(false)
  })
})

describe('buildEditorQuads', () => {
  const specification: W3cSpecification = {
    uri: 'https://www.w3.org/TR/example/',
    apiUrl: 'https://api.w3.org/specifications/example',
    title: 'Example',
  }

  test('links editors to person URNs and creates new people', () => {
    const quads = buildEditorQuads(
      [
        {
          specification,
          editors: [
            {
              id: 123,
              href: 'https://api.w3.org/users/opaque',
              name: 'Editor Person',
              githubId: '456',
              githubUsername: 'editor',
            },
          ],
        },
      ],
      new Set(),
    )
    expect(
      quads.find(
        (item) =>
          item.predicate.value === 'http://purl.org/ontology/bibo/editor',
      )?.object.value,
    ).toBe('urn:w3c:person:123')
    expect(
      quads.find(
        (item) =>
          item.subject.value === 'urn:w3c:person:123' &&
          item.predicate.value === `${EX}name`,
      )?.object.value,
    ).toBe('Editor Person')
    expect(
      quads.find(
        (item) =>
          item.subject.value === 'urn:w3c:person:123' &&
          item.predicate.value === `${EX}w3cApiUrl`,
      )?.object.value,
    ).toBe('https://api.w3.org/users/opaque')
  })

  test('does not duplicate properties for existing people', () => {
    const quads = buildEditorQuads(
      [
        {
          specification,
          editors: [
            {
              id: 123,
              href: 'https://api.w3.org/users/opaque',
              name: 'Editor Person',
            },
          ],
        },
      ],
      new Set([123]),
    )
    expect(
      quads.some(
        (item) =>
          item.subject.value === 'urn:w3c:person:123' &&
          item.predicate.value === `${EX}name`,
      ),
    ).toBe(false)
    expect(
      quads.some(
        (item) =>
          item.predicate.value === 'http://purl.org/ontology/bibo/editor',
      ),
    ).toBe(true)
  })
})

describe('duplicate W3C ids', () => {
  test('participant references are canonical and duplicate metadata is dropped', () => {
    const group: W3cGroupRef = {
      uri: 'https://www.w3.org/groups/wg/example/',
      apiUrl: 'https://api.w3.org/groups/wg/example',
      id: 1,
      name: 'Example Working Group',
    }
    const quads = buildParticipantQuads(
      [
        {
          group,
          participants: [
            {
              id: 42931,
              href: 'https://api.w3.org/users/duplicate',
              name: 'Pierre-Antoine Champin',
            },
          ],
        },
      ],
      new Set([129656]),
    )
    expect(
      quads.some((item) => item.subject.value.includes('42931')),
    ).toBe(false)
    expect(
      quads.some((item) => item.object.value.includes('42931')),
    ).toBe(false)
    expect(
      quads.find((item) => item.predicate.value === `${EX}member`)?.object.value,
    ).toBe('urn:w3c:person:129656')
  })

  test('editor references are canonical and duplicate metadata is dropped', () => {
    const quads = buildEditorQuads(
      [
        {
          specification: {
            uri: 'https://www.w3.org/TR/example/',
            apiUrl: 'https://api.w3.org/specifications/example',
            title: 'Example',
          },
          editors: [
            {
              id: 42931,
              href: 'https://api.w3.org/users/duplicate',
              name: 'Pierre-Antoine Champin',
            },
          ],
        },
      ],
      new Set([129656]),
    )
    expect(
      quads.some(
        (item) =>
          item.subject.value.includes('42931') ||
          item.object.value.includes('42931'),
      ),
    ).toBe(false)
    expect(
      quads.find(
        (item) =>
          item.predicate.value === 'http://purl.org/ontology/bibo/editor',
      )?.object.value,
    ).toBe('urn:w3c:person:129656')
  })
})

// Pure helpers for the W3C API workflow: find the W3C groups the catalog
// already knows about, and turn their participant lists into catalog RDF.
// The catalog's own vocabulary is reused (ex:Organization, ex:Person,
// ex:name, ex:siloId, ex:member) so the UI queries W3C data like any other
// catalog data.
import { DataFactory, Writer } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import { EX, RDF_TYPE, parseCatalogDataset } from '../software-dependencies/analysis.ts'
import type { Quad, Store } from 'n3'

export const W3C_SILO_PREFIX = 'w3c:'
export const ORGANIZATION_TYPE = `${EX}Organization`
export const PERSON_TYPE = `${EX}Person`
export const SILO_ID = `${EX}siloId`
export const NAME = `${EX}name`
export const LOGO = `${EX}logo`
export const MEMBER = `${EX}member`

export interface W3cGroupRef {
  uri: string
  id: number
  name: string
}

export interface W3cParticipant {
  /** W3C API user id (the numeric IPP id the catalog stores as "w3c:<id>"). */
  id: number
  /** API user URI; identifies people the catalog does not know yet. */
  href: string
  name: string
  /** Profile thumbnail from the API, when the account has one. */
  photo?: string
}

export interface W3cGroupParticipants {
  group: W3cGroupRef
  participants: W3cParticipant[]
}

export interface W3cCatalog {
  /** ex:Organization entries with an ex:siloId of "w3c:<group id>". */
  groups: W3cGroupRef[]
  /** ex:siloId "w3c:<user id>" -> person URI already present in the catalog. */
  personUris: Map<string, string>
}

let engine: QueryEngine | undefined

function queryEngine(): QueryEngine {
  engine ??= new QueryEngine()
  return engine
}

async function findGroups(store: Store): Promise<W3cGroupRef[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?uri ?name ?siloId WHERE {
       ?uri <${RDF_TYPE}> <${ORGANIZATION_TYPE}> ;
            <${NAME}> ?name ;
            <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const groups: W3cGroupRef[] = []
  for await (const binding of bindings) {
    const uri = binding.get('uri')?.value
    const name = binding.get('name')?.value
    const siloId = binding.get('siloId')?.value
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.push({ uri, id, name })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

async function findPersonUris(store: Store): Promise<Map<string, string>> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person ?siloId WHERE {
       ?person <${RDF_TYPE}> <${PERSON_TYPE}> ; <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const personUris = new Map<string, string>()
  for await (const binding of bindings) {
    const person = binding.get('person')?.value
    const siloId = binding.get('siloId')?.value
    if (person && siloId) personUris.set(siloId, person)
  }
  return personUris
}

/** Read the catalog once and collect both the W3C groups and the known people. */
export async function readW3cCatalog(ttl: string): Promise<W3cCatalog> {
  const store = await parseCatalogDataset(ttl)
  return {
    groups: await findGroups(store),
    personUris: await findPersonUris(store),
  }
}

const { namedNode, literal, quad } = DataFactory

/**
 * RDF for the fetched participants, in the catalog's vocabulary: every
 * participant is linked from its group with ex:member, and people the catalog
 * does not know yet become ex:Person records carrying ex:name, ex:siloId and
 * ex:logo. People already in the catalog are matched on their "w3c:" siloId
 * (the numeric W3C user id) and keep their URI and their existing name, so a
 * run never forks one person into two records.
 */
export function buildParticipantQuads(
  groups: W3cGroupParticipants[],
  personUris: ReadonlyMap<string, string>,
): Quad[] {
  const quads: Quad[] = []
  const seenPeople = new Set<string>()
  for (const { group, participants } of groups) {
    const groupNode = namedNode(group.uri)
    for (const participant of participants) {
      const siloId = `${W3C_SILO_PREFIX}${participant.id}`
      const personUri = personUris.get(siloId) ?? participant.href
      quads.push(quad(groupNode, namedNode(MEMBER), namedNode(personUri)))

      if (personUris.has(siloId) || seenPeople.has(personUri)) continue
      seenPeople.add(personUri)
      const personNode = namedNode(personUri)
      quads.push(quad(personNode, namedNode(RDF_TYPE), namedNode(PERSON_TYPE)))
      quads.push(quad(personNode, namedNode(NAME), literal(participant.name)))
      quads.push(quad(personNode, namedNode(SILO_ID), literal(siloId)))
      if (participant.photo) {
        quads.push(quad(personNode, namedNode(LOGO), namedNode(participant.photo)))
      }
    }
  }
  return quads
}

/** N-Quads serialization, the format the SPARQL store accepts. */
export function serializeQuads(quads: Quad[]): string {
  return new Writer().quadsToString(quads)
}

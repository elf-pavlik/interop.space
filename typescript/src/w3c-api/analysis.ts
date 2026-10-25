// Pure helpers for the W3C API workflow: read the seed graph (the previous
// dump or a generated start record), find the people whose W3C memberships
// should be fetched, and turn API group participants into catalog RDF. The
// catalog's own vocabulary is reused (ex:Organization, ex:Person, ex:name,
// ex:siloId, ex:member) so the UI queries W3C data like any other catalog data.
import { DataFactory, Parser, Store, Writer } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import { EX, RDF_TYPE } from '../software-dependencies/analysis.ts'
import type { Quad } from 'n3'

export const W3C_SILO_PREFIX = 'w3c:'
export const GITHUB_SILO_PREFIX = 'github:'
export const ORGANIZATION_TYPE = `${EX}Organization`
export const PERSON_TYPE = `${EX}Person`
export const SILO_ID = `${EX}siloId`
export const SILO_USERNAME = `${EX}siloUsername`
export const NAME = `${EX}name`
export const LOGO = `${EX}logo`
export const MEMBER = `${EX}member`
export const SPECIFICATION = `${EX}specification`
export const SPECIFICATION_TYPE = `${EX}Specification`
export const SHORTNAME = `${EX}shortname`
export const LANDING_PAGE = `${EX}landingPage`
export const EDITOR_DRAFT = `${EX}editorDraft`

export interface W3cGroupRef {
  uri: string
  id: number
  name: string
}

export interface W3cParticipant {
  /** W3C API user id (the numeric IPP id the catalog stores as "w3c:<id>"). */
  id: number
  /** API user URI; identifies people the seed does not know yet. */
  href: string
  name: string
  /** Profile thumbnail from the API, when the account has one. */
  photo?: string
  /** GitHub numeric id from the user's connected accounts, when linked. */
  githubId?: string
  /** GitHub login from the user's connected accounts, when linked. */
  githubUsername?: string
}

export interface W3cGroupParticipants {
  group: W3cGroupRef
  participants: W3cParticipant[]
}

export interface W3cSpecification {
  /** API self URI, e.g. https://api.w3.org/specifications/lws-ucs. */
  uri: string
  title: string
  shortname?: string
  /** Public Technical Report URL. */
  shortlink?: string
  editorDraft?: string
}

export interface W3cGroupSpecifications {
  group: W3cGroupRef
  specifications: W3cSpecification[]
}

/**
 * A person in the seed graph the workflow starts from. The GitHub account is
 * the join key: api.w3.org can resolve it to the person's W3C user, which in
 * turn lists the groups they belong to.
 */
export interface W3cAccount {
  /** Person URI in the seed dataset. */
  personUri: string
  name: string
  /** GitHub account id from ex:siloId "github:<id>". */
  githubId: string
  /** Numeric W3C user id, when the dataset already carries one. */
  w3cId?: number
  /**
   * True when the seed already links this person to a W3C group. With frozen
   * upstream data we treat "has a group" as "already fetched": the person's
   * full group list is not queried again. This deliberately does not discover
   * groups beyond the ones already in the graph.
   */
  hasW3cGroups: boolean
}

export interface W3cDataset {
  /** People with a GitHub account, i.e. the W3C API entry points. */
  accounts: W3cAccount[]
  /** ex:siloId "w3c:<user id>" -> person URI already present in the dataset. */
  personUris: Map<string, string>
  /** W3C group ids already represented by an ex:Organization record. */
  groupIds: number[]
  /** W3C groups that have no ex:specification link yet. */
  groupsWithoutSpecs: W3cGroupRef[]
}

/** Person record generated when there is no dump to seed from. */
export interface W3cSeedPerson {
  personUri: string
  name: string
  githubId: string
  githubUsername: string
  w3cId: number
  logo?: string
}

let engine: QueryEngine | undefined

function queryEngine(): QueryEngine {
  engine ??= new QueryEngine()
  return engine
}

/** Parse an N-Quads document (the seed dataset format) into an N3 store. */
export function parseDataset(nquads: string): Promise<Store> {
  return new Promise((resolve, reject) => {
    const store = new Store()
    new Parser({ format: 'N-Quads' }).parse(nquads, (error, quad) => {
      if (error) {
        reject(error)
      } else if (quad) {
        store.addQuad(quad)
      } else {
        resolve(store)
      }
    })
  })
}

/**
 * People already linked from a W3C group with ex:member. Membership in a
 * non-W3C organization (e.g. a catalog project) does not count.
 */
async function findPeopleWithW3cGroups(store: Store): Promise<Set<string>> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person WHERE {
       ?group <${RDF_TYPE}> <${ORGANIZATION_TYPE}> ;
              <${SILO_ID}> ?groupSiloId ;
              <${MEMBER}> ?person .
       FILTER (STRSTARTS(STR(?groupSiloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const people = new Set<string>()
  for await (const binding of bindings) {
    const person = binding.get('person')?.value
    if (person) people.add(person)
  }
  return people
}

/**
 * People the workflow can start from: ex:Person records carrying a GitHub
 * siloId. Other siloIds (e.g. the numeric "w3c:<id>") are collected too, so the
 * person keeps their URI when they show up as a participant of their groups.
 */
async function findAccounts(store: Store): Promise<W3cAccount[]> {
  const withGroups = await findPeopleWithW3cGroups(store)
  const bindings = await queryEngine().queryBindings(
    `SELECT ?person ?name ?siloId WHERE {
       ?person <${RDF_TYPE}> <${PERSON_TYPE}> ; <${SILO_ID}> ?siloId .
       OPTIONAL { ?person <${NAME}> ?name }
     }`,
    { sources: [store] },
  )
  const people = new Map<
    string,
    { name?: string; githubId?: string; w3cId?: number }
  >()
  for await (const binding of bindings) {
    const person = binding.get('person')?.value
    const siloId = binding.get('siloId')?.value
    if (!person || !siloId) continue
    let entry = people.get(person)
    if (!entry) {
      entry = {}
      people.set(person, entry)
    }
    entry.name ??= binding.get('name')?.value
    if (siloId.startsWith(GITHUB_SILO_PREFIX)) {
      entry.githubId ??= siloId.slice(GITHUB_SILO_PREFIX.length)
    } else if (siloId.startsWith(W3C_SILO_PREFIX)) {
      const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
      if (Number.isInteger(id)) entry.w3cId ??= id
    }
  }
  return [...people.entries()]
    .filter(([, entry]) => entry.githubId !== undefined)
    .map(([personUri, entry]) => ({
      personUri,
      name: entry.name ?? personUri,
      githubId: entry.githubId!,
      w3cId: entry.w3cId,
      hasW3cGroups: withGroups.has(personUri),
    }))
    .sort((a, b) => a.personUri.localeCompare(b.personUri))
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

async function findGroupIds(store: Store): Promise<number[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?siloId WHERE {
       ?group <${RDF_TYPE}> <${ORGANIZATION_TYPE}> ; <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const ids = new Set<number>()
  for await (const binding of bindings) {
    const siloId = binding.get('siloId')?.value
    if (!siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (Number.isInteger(id)) ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

async function findGroupsWithoutSpecs(store: Store): Promise<W3cGroupRef[]> {
  const bindings = await queryEngine().queryBindings(
    `SELECT ?group ?name ?siloId WHERE {
       ?group <${RDF_TYPE}> <${ORGANIZATION_TYPE}> ;
              <${NAME}> ?name ;
              <${SILO_ID}> ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
       FILTER NOT EXISTS { ?group <${SPECIFICATION}> ?spec }
     }`,
    { sources: [store] },
  )
  const groups: W3cGroupRef[] = []
  for await (const binding of bindings) {
    const uri = binding.get('group')?.value
    const name = binding.get('name')?.value
    const siloId = binding.get('siloId')?.value
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.push({ uri, id, name })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

/** Read the seed graph once for accounts, known people and known groups. */
export async function readDataset(nquads: string): Promise<W3cDataset> {
  const store = await parseDataset(nquads)
  return {
    accounts: await findAccounts(store),
    personUris: await findPersonUris(store),
    groupIds: await findGroupIds(store),
    groupsWithoutSpecs: await findGroupsWithoutSpecs(store),
  }
}

const { namedNode, literal, quad } = DataFactory

/**
 * RDF for the groups the W3C API returned: the UI's group view selects
 * ex:Organization resources carrying ex:siloId "w3c:<group id>".
 */
export function buildGroupQuads(groups: W3cGroupRef[]): Quad[] {
  const quads: Quad[] = []
  const seenGroups = new Set<string>()
  for (const group of groups) {
    if (seenGroups.has(group.uri)) continue
    seenGroups.add(group.uri)
    const groupNode = namedNode(group.uri)
    quads.push(quad(groupNode, namedNode(RDF_TYPE), namedNode(ORGANIZATION_TYPE)))
    quads.push(quad(groupNode, namedNode(NAME), literal(group.name)))
    quads.push(
      quad(groupNode, namedNode(SILO_ID), literal(`${W3C_SILO_PREFIX}${group.id}`)),
    )
  }
  return quads
}

/**
 * RDF for the person a fresh run starts from when there is no dump yet. The
 * GitHub account is what lets the workflow resolve the W3C user (and mirrors
 * what future dumps get for every participant with a connected GitHub account).
 */
export function buildStartPersonQuads(person: W3cSeedPerson): Quad[] {
  const personNode = namedNode(person.personUri)
  const quads = [
    quad(personNode, namedNode(RDF_TYPE), namedNode(PERSON_TYPE)),
    quad(personNode, namedNode(NAME), literal(person.name)),
    quad(
      personNode,
      namedNode(SILO_ID),
      literal(`${GITHUB_SILO_PREFIX}${person.githubId}`),
    ),
    quad(
      personNode,
      namedNode(SILO_ID),
      literal(`${W3C_SILO_PREFIX}${person.w3cId}`),
    ),
    quad(
      personNode,
      namedNode(SILO_USERNAME),
      literal(`${GITHUB_SILO_PREFIX}${person.githubUsername}`),
    ),
  ]
  if (person.logo) {
    quads.push(quad(personNode, namedNode(LOGO), namedNode(person.logo)))
  }
  return quads
}

/**
 * RDF for the fetched participants, in the catalog's vocabulary: every
 * participant is linked from its group with ex:member, and people the seed
 * does not know yet become ex:Person records carrying ex:name, ex:siloId,
 * ex:siloUsername and ex:logo. People already in the seed are matched on their
 * "w3c:" siloId (the numeric W3C user id) and keep their URI and their
 * existing name, so a run never forks one person into two records.
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
      if (participant.githubId) {
        quads.push(
          quad(
            personNode,
            namedNode(SILO_ID),
            literal(`${GITHUB_SILO_PREFIX}${participant.githubId}`),
          ),
        )
      }
      if (participant.githubUsername) {
        quads.push(
          quad(
            personNode,
            namedNode(SILO_USERNAME),
            literal(`${GITHUB_SILO_PREFIX}${participant.githubUsername}`),
          ),
        )
      }
      if (participant.photo) {
        quads.push(quad(personNode, namedNode(LOGO), namedNode(participant.photo)))
      }
    }
  }
  return quads
}

/** Group records plus their participants, ready to store as N-Quads. */
export function buildW3cQuads(
  groups: W3cGroupParticipants[],
  personUris: ReadonlyMap<string, string>,
): Quad[] {
  return [
    ...buildGroupQuads(groups.map((group) => group.group)),
    ...buildParticipantQuads(groups, personUris),
  ]
}

/**
 * RDF for the specifications delivered by each group. A group gets one
 * ex:specification link per spec, which is also the "specs fetched" check for
 * later runs; a group without specs produces no link and is retried.
 */
export function buildSpecificationQuads(
  groups: W3cGroupSpecifications[],
): Quad[] {
  const quads: Quad[] = []
  const seenSpecs = new Set<string>()
  for (const { group, specifications } of groups) {
    const groupNode = namedNode(group.uri)
    for (const spec of specifications) {
      const specNode = namedNode(spec.uri)
      quads.push(quad(groupNode, namedNode(SPECIFICATION), specNode))
      if (seenSpecs.has(spec.uri)) continue
      seenSpecs.add(spec.uri)
      quads.push(
        quad(specNode, namedNode(RDF_TYPE), namedNode(SPECIFICATION_TYPE)),
      )
      quads.push(quad(specNode, namedNode(NAME), literal(spec.title)))
      if (spec.shortname) {
        quads.push(
          quad(specNode, namedNode(SHORTNAME), literal(spec.shortname)),
        )
      }
      if (spec.shortlink) {
        quads.push(
          quad(specNode, namedNode(LANDING_PAGE), namedNode(spec.shortlink)),
        )
      }
      if (spec.editorDraft) {
        quads.push(
          quad(specNode, namedNode(EDITOR_DRAFT), namedNode(spec.editorDraft)),
        )
      }
    }
  }
  return quads
}

/** N-Quads serialization, the format the SPARQL store accepts. */
export function serializeQuads(quads: Quad[]): string {
  return new Writer().quadsToString(quads)
}

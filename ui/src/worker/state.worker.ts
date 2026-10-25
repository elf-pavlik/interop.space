/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { SparqlEndpointFetcher, type IBindings } from 'fetch-sparql-endpoint'
import type {
  AppState,
  Command,
  Person,
  Project,
  SliceUpdate,
  Software,
  Specification,
  W3cGroup,
  W3cParticipant,
} from './protocol'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
  software: { status: 'idle', data: [] },
  specifications: { status: 'idle', data: [] },
  w3cGroups: {
    status: 'idle',
    data: { groups: [], selected: [], common: [] },
  },
}

const emit = (u: SliceUpdate) => self.postMessage(u)

// ---------------------------------------------------------------------------
// SPARQL endpoint
// ---------------------------------------------------------------------------
// The catalog is served by Apache Fuseki, so the UI queries it directly
// instead of downloading the (previously public/dump.nq) snapshot. Query over
// HTTPS: the http:// URL answers with a 302, and following that redirect drops
// a POSTed query body.
const SPARQL_ENDPOINT =
  'https://fuseki-elf-pavlik-dev.apps.rm1.0a51.p1.openshiftapps.com/ds'

// POST keeps long queries out of the URL. Fuseki replies with SPARQL JSON.
const fetcher = new SparqlEndpointFetcher({ method: 'POST' })

type BindingsStream = Awaited<
  ReturnType<SparqlEndpointFetcher['fetchBindings']>
>

// fetch-sparql-endpoint hands back plain objects keyed by variable name, not
// Comunica's Bindings with `.get()` — see
// https://github.com/rubensworks/fetch-sparql-endpoint.js/issues/92.
const value = (binding: IBindings, variable: string) =>
  binding[variable]?.value

// Drain a result stream into an array; the handlers below then process rows
// synchronously (the fetcher returns a Node-style readable stream).
function collectBindings(stream: BindingsStream): Promise<IBindings[]> {
  return new Promise((resolve, reject) => {
    const rows: IBindings[] = []
    stream.on('data', (binding: IBindings) => rows.push(binding))
    stream.on('end', () => resolve(rows))
    stream.on('error', reject)
  })
}

async function queryBindings(query: string): Promise<IBindings[]> {
  return collectBindings(await fetcher.fetchBindings(SPARQL_ENDPOINT, query))
}

// ---------------------------------------------------------------------------
// SPARQL helpers
// ---------------------------------------------------------------------------
// The catalog uses the local `ex:` namespace (http://example.org#).
const EX = 'http://example.org#'
const TAX = 'https://solidproject.solidcommunity.net/catalog/taxonomy#'

// Short display/URL form of a catalog URI: tail after the last / or #,
// with a leading urn:uuid: prefix dropped (e.g. urn:uuid:abc -> abc).
const short = (uri: string) =>
  uri.replace(/^.*[/#]/, '').replace(/^urn:uuid:/, '')

const robohash = (seed: string) =>
  `https://robohash.org/${seed}?set=set4&size=128x128`

const toPerson = (id: string, name: string, handle?: string): Person => ({
  id: short(id),
  uri: id,
  name,
  handle,
  avatarUrl: robohash(short(id)),
})

async function sparqlPeople(): Promise<Person[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?id ?name ?handle WHERE {
       ?id a ex:Person ; ex:name ?name .
       OPTIONAL { ?id ex:forumHandle ?handle }
     }`,
  )
  const people: Person[] = []
  for (const b of rows) {
    const id = value(b, 'id')
    const name = value(b, 'name')
    if (id && name) people.push(toPerson(id, name, value(b, 'handle')))
  }
  return people
}

async function sparqlProjects(): Promise<Project[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     PREFIX tax: <${TAX}>
     SELECT ?id ?name ?description ?member WHERE {
       ?id a ex:Organization ; ex:name ?name ; ex:subType ?subType .
       FILTER (?subType = tax:OpenSourceProject || ?subType = tax:UniversityProject)
       OPTIONAL { ?id ex:description ?description }
       OPTIONAL { ?id ex:member ?member }
     }`,
  )
  // Gather members per project
  const map = new Map<string, Project>()
  for (const b of rows) {
    const id = value(b, 'id')
    if (!id) continue
    const shortId = short(id)
    if (!map.has(shortId)) {
      map.set(shortId, {
        id: shortId,
        uri: id,
        name: value(b, 'name') ?? '',
        description: value(b, 'description') ?? '',
        memberIds: [],
      })
    }
    const member = value(b, 'member')
    if (member) {
      const p = map.get(shortId)!
      const shortMember = short(member)
      if (!p.memberIds.includes(shortMember)) p.memberIds.push(shortMember)
    }
  }
  return [...map.values()]
}

async function sparqlSoftware(): Promise<Software[]> {
  // Software package names and dependency edges (resolved to names below).
  const [nameRows, edgeRows] = await Promise.all([
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?s ?name WHERE {
         ?s a ex:Software ; ex:name ?name
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?s ?dep WHERE {
         ?s ex:hasDependencyOn ?dep
       }`,
    ),
  ])
  const names = new Map<string, string>()
  for (const b of nameRows) {
    const s = value(b, 's')
    const n = value(b, 'name')
    if (s && n) names.set(s, n)
  }
  const edges = new Map<string, Set<string>>()
  for (const b of edgeRows) {
    const s = value(b, 's')
    const dep = value(b, 'dep')
    if (s && dep) {
      if (!edges.has(s)) edges.set(s, new Set())
      edges.get(s)!.add(dep)
    }
  }
  const list: Software[] = []
  for (const [uri, name] of names) {
    const dependencies = [...(edges.get(uri) ?? [])]
      .map((dep) => names.get(dep) ?? short(dep))
      .sort((a, b) => a.localeCompare(b))
    list.push({ id: short(uri), uri, name, dependencies })
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

async function sparqlSpecifications(): Promise<Specification[]> {
  const rows = await queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?spec ?name ?shortname ?landingPage ?editorDraft ?groupName WHERE {
       ?spec a ex:Specification ; ex:name ?name .
       OPTIONAL { ?spec ex:shortname ?shortname }
       OPTIONAL { ?spec ex:landingPage ?landingPage }
       OPTIONAL { ?spec ex:editorDraft ?editorDraft }
       OPTIONAL {
         ?group a ex:Organization ; ex:specification ?spec ; ex:name ?groupName .
       }
     }`,
  )
  const specs = new Map<string, Specification>()
  for (const b of rows) {
    const uri = value(b, 'spec')
    const name = value(b, 'name')
    if (!uri || !name) continue
    let spec = specs.get(uri)
    if (!spec) {
      spec = {
        id: short(uri),
        uri,
        name,
        shortname: value(b, 'shortname'),
        landingPage: value(b, 'landingPage'),
        editorDraft: value(b, 'editorDraft'),
        groups: [],
      }
      specs.set(uri, spec)
    }
    const groupName = value(b, 'groupName')
    if (groupName && !spec.groups.includes(groupName)) {
      spec.groups.push(groupName)
    }
  }
  for (const spec of specs.values()) {
    spec.groups.sort((a, b) => a.localeCompare(b))
  }
  return [...specs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// W3C groups
// ---------------------------------------------------------------------------
// The W3C API workflow (typescript/src/w3c-api) writes the groups and their
// participants into the catalog dump, so this worker only queries it. Groups
// carry the W3C group id as ex:siloId "w3c:<group id>", participants are
// ex:Person records linked from their group with ex:member.
const W3C_SILO_PREFIX = 'w3c:'

const toW3cParticipant = (
  uri: string,
  name: string,
  logo?: string,
): W3cParticipant => ({
  uri,
  name,
  avatarUrl: logo ?? robohash(short(uri)),
})

async function sparqlW3cGroups(): Promise<W3cGroup[]> {
  const groups = new Map<string, W3cGroup>()
  const [groupRows, memberRows] = await Promise.all([
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?uri ?name ?siloId WHERE {
         ?uri a ex:Organization ; ex:name ?name ; ex:siloId ?siloId .
         FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
       }`,
    ),
    queryBindings(
      `PREFIX ex: <${EX}>
       SELECT ?group ?person ?name ?logo WHERE {
         ?group a ex:Organization ; ex:siloId ?siloId ; ex:member ?person .
         FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
         ?person a ex:Person ; ex:name ?name .
         OPTIONAL { ?person ex:logo ?logo }
       }`,
    ),
  ])
  for (const b of groupRows) {
    const uri = value(b, 'uri')
    const name = value(b, 'name')
    const siloId = value(b, 'siloId')
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.set(uri, { id, uri, name, participants: [] })
  }

  for (const b of memberRows) {
    const groupUri = value(b, 'group')
    const person = value(b, 'person')
    const name = value(b, 'name')
    const group = groupUri ? groups.get(groupUri) : undefined
    if (!group || !person || !name) continue
    // A person with several logos binds more than once; keep the first row.
    if (group.participants.some((p) => p.uri === person)) continue
    group.participants.push(toW3cParticipant(person, name, value(b, 'logo')))
  }

  for (const group of groups.values()) {
    group.participants.sort((a, b) => a.name.localeCompare(b.name))
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Intersection of every selected group's participant list. With fewer than two
// groups there is no intersection; the view shows the single group instead.
function commonParticipants(
  groups: W3cGroup[],
  selected: number[],
): W3cParticipant[] {
  const chosen = groups.filter((g) => selected.includes(g.id))
  if (chosen.length < 2) return []
  const commonUris = chosen
    .map((g) => new Set(g.participants.map((p) => p.uri)))
    .reduce((a, b) => a.intersection(b))
  return chosen[0].participants
    .filter((p) => commonUris.has(p.uri))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function loadPeople() {
  if (state.people.status === 'loading') return
  state.people = { status: 'loading', data: state.people.data }
  emit({ key: 'people', value: state.people })
  try {
    const data = await sparqlPeople()
    state.people = { status: 'ready', data }
  } catch (e) {
    state.people = { status: 'error', data: state.people.data, error: String(e) }
  }
  emit({ key: 'people', value: state.people })
}

async function loadProjects() {
  if (state.projects.status === 'loading') return
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    const data = await sparqlProjects()
    state.projects = { status: 'ready', data }
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
  }
  emit({ key: 'projects', value: state.projects })
}

async function loadSoftware() {
  if (state.software.status === 'loading') return
  state.software = { status: 'loading', data: state.software.data }
  emit({ key: 'software', value: state.software })
  try {
    const data = await sparqlSoftware()
    state.software = { status: 'ready', data }
  } catch (e) {
    state.software = {
      status: 'error',
      data: state.software.data,
      error: String(e),
    }
  }
  emit({ key: 'software', value: state.software })
}

async function loadSpecifications() {
  if (state.specifications.status === 'loading') return
  state.specifications = {
    status: 'loading',
    data: state.specifications.data,
  }
  emit({ key: 'specifications', value: state.specifications })
  try {
    const data = await sparqlSpecifications()
    state.specifications = { status: 'ready', data }
  } catch (e) {
    state.specifications = {
      status: 'error',
      data: state.specifications.data,
      error: String(e),
    }
  }
  emit({ key: 'specifications', value: state.specifications })
}

async function loadW3cGroups() {
  if (state.w3cGroups.status === 'loading') return
  state.w3cGroups = { status: 'loading', data: state.w3cGroups.data }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
  try {
    const groups = await sparqlW3cGroups()
    // Load with no groups selected; the checkboxes drive the comparison.
    const selected: number[] = []
    state.w3cGroups = {
      status: 'ready',
      data: { groups, selected, common: commonParticipants(groups, selected) },
    }
  } catch (e) {
    state.w3cGroups = {
      status: 'error',
      data: state.w3cGroups.data,
      error: String(e),
    }
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
}

// The participants are already in the dump, so selecting a group only
// recomputes the intersection — no async work, no stale-write races.
function toggleW3cGroup(id: number) {
  const data = state.w3cGroups.data
  if (!data.groups.some((g) => g.id === id)) return
  const selected = data.selected.includes(id)
    ? data.selected.filter((x) => x !== id)
    : [...data.selected, id]
  state.w3cGroups = {
    status: 'ready',
    data: {
      ...data,
      selected,
      common: commonParticipants(data.groups, selected),
    },
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
}

async function loadProject(id: string) {
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    // Prefer an already-loaded record: exact short-id match on the current
    // slice (keeps the full list intact when navigating from /projects).
    const known = state.projects.data.find(
      (p) => p.id === id || p.uri === `urn:uuid:${id}`,
    )
    let project: Project | undefined = known
      ? { ...known, memberIds: [] }
      : undefined

    if (!project) {
      // Resolve the catalog URI from the short id: urn:uuid:<id>, https://<id>,
      // or any URI ending in /<id> or #<id>.
      const rows = await queryBindings(
        `PREFIX ex: <${EX}>
         SELECT ?id ?name ?description WHERE {
           ?id a ex:Organization .
           FILTER (
             STR(?id) = "urn:uuid:${id}"
             || STR(?id) = "https://${id}"
             || STRENDS(STR(?id), "/${id}")
             || STRENDS(STR(?id), "#${id}")
           )
           OPTIONAL { ?id ex:name ?name }
           OPTIONAL { ?id ex:description ?description }
         }
         LIMIT 1`,
      )
      for (const b of rows) {
        const uri = value(b, 'id')
        if (!uri) continue
        project = {
          id: short(uri),
          uri,
          name: value(b, 'name') ?? '',
          description: value(b, 'description') ?? '',
          memberIds: [],
        }
        break
      }
    }

    if (project) {
      const memberIds: string[] = []
      const memberUris: string[] = []
      const memberRows = await queryBindings(
        `PREFIX ex: <${EX}>
         SELECT ?member WHERE { <${project.uri}> ex:member ?member }`,
      )
      for (const b of memberRows) {
        const member = value(b, 'member')
        if (member) {
          const shortMember = short(member)
          if (!memberIds.includes(shortMember)) {
            memberIds.push(shortMember)
            memberUris.push(member)
          }
        }
      }
      project.memberIds = memberIds

      // Keep the full list when we already had it; otherwise the resolved
      // record is the slice (direct navigation to a detail page).
      const data = known
        ? state.projects.data.map((p) =>
            p.id === project!.id ? project! : p,
          )
        : [project]
      state.projects = { status: 'ready', data }
      emit({ key: 'projects', value: state.projects })

      // Load associated member people
      if (memberUris.length) {
        const values = memberUris.map((uri) => `<${uri}>`).join(' ')
        const peopleRows = await queryBindings(
          `PREFIX ex: <${EX}>
           SELECT ?id ?name ?handle WHERE {
             VALUES ?id { ${values} }
             ?id a ex:Person ; ex:name ?name .
             OPTIONAL { ?id ex:forumHandle ?handle }
           }`,
        )
        const members: Person[] = []
        for (const b of peopleRows) {
          const pid = value(b, 'id')
          const pname = value(b, 'name')
          if (pid && pname) members.push(toPerson(pid, pname, value(b, 'handle')))
        }
        state.people = { status: 'ready', data: members }
        emit({ key: 'people', value: state.people })
      }
    }
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
    emit({ key: 'projects', value: state.projects })
  }
}

// ---------------------------------------------------------------------------
// Mailbox
// ---------------------------------------------------------------------------
self.onmessage = (e: MessageEvent<Command>) => {
  switch (e.data.type) {
    case 'loadPeople':
      loadPeople()
      break
    case 'loadProjects':
      loadProjects()
      break
    case 'loadProject':
      loadProject(e.data.id)
      break
    case 'loadSoftware':
      loadSoftware()
      break
    case 'loadSpecifications':
      loadSpecifications()
      break
    case 'loadW3cGroups':
      loadW3cGroups()
      break
    case 'toggleW3cGroup':
      toggleW3cGroup(e.data.id)
      break
  }
}
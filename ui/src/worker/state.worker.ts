/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { Store, Parser } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import type {
  AppState,
  Command,
  Person,
  Project,
  SliceUpdate,
  Software,
} from './protocol'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
  software: { status: 'idle', data: [] },
}

const emit = (u: SliceUpdate) => self.postMessage(u)

// ---------------------------------------------------------------------------
// Lazy-loaded RDF store + query engine
// ---------------------------------------------------------------------------
let _store: Store | null = null
let _engine: QueryEngine | null = null

async function ensureRdf(): Promise<{ store: Store; engine: QueryEngine }> {
  if (_store && _engine) return { store: _store, engine: _engine }
  const res = await fetch('/dump.nq')
  const text = await res.text()
  const store = new Store()
  const parser = new Parser()
  parser.parse(text, (_err, quad) => {
    if (quad) store.addQuad(quad)
  })
  _store = store
  _engine = new QueryEngine()
  return { store, engine: _engine }
}

// ---------------------------------------------------------------------------
// SPARQL helpers
// ---------------------------------------------------------------------------
// The catalog dump uses the local `ex:` namespace (http://example.org#).
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
  const { store, engine } = await ensureRdf()
  const stream = await engine.queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?id ?name ?handle WHERE {
       ?id a ex:Person ; ex:name ?name .
       OPTIONAL { ?id ex:forumHandle ?handle }
     }`,
    { sources: [store] },
  )
  const people: Person[] = []
  for await (const b of stream) {
    const id = b.get('id')?.value
    const name = b.get('name')?.value
    if (id && name) people.push(toPerson(id, name, b.get('handle')?.value))
  }
  return people
}

async function sparqlProjects(): Promise<Project[]> {
  const { store, engine } = await ensureRdf()
  const stream = await engine.queryBindings(
    `PREFIX ex: <${EX}>
     PREFIX tax: <${TAX}>
     SELECT ?id ?name ?description ?member WHERE {
       ?id a ex:Organization ; ex:name ?name ; ex:subType ?subType .
       FILTER (?subType = tax:OpenSourceProject || ?subType = tax:UniversityProject)
       OPTIONAL { ?id ex:description ?description }
       OPTIONAL { ?id ex:member ?member }
     }`,
    { sources: [store] },
  )
  // Gather members per project
  const map = new Map<string, Project>()
  for await (const b of stream) {
    const id = b.get('id')?.value
    if (!id) continue
    const shortId = short(id)
    if (!map.has(shortId)) {
      map.set(shortId, {
        id: shortId,
        uri: id,
        name: b.get('name')?.value ?? '',
        description: b.get('description')?.value ?? '',
        memberIds: [],
      })
    }
    const member = b.get('member')?.value
    if (member) {
      const p = map.get(shortId)!
      const shortMember = short(member)
      if (!p.memberIds.includes(shortMember)) p.memberIds.push(shortMember)
    }
  }
  return [...map.values()]
}

async function sparqlSoftware(): Promise<Software[]> {
  const { store, engine } = await ensureRdf()
  // Software package names
  const names = new Map<string, string>()
  const nameStream = await engine.queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?s ?name WHERE {
       ?s a ex:Software ; ex:name ?name
     }`,
    { sources: [store] },
  )
  for await (const b of nameStream) {
    const s = b.get('s')?.value
    const n = b.get('name')?.value
    if (s && n) names.set(s, n)
  }
  // Dependency edges, resolved to names below
  const edges = new Map<string, Set<string>>()
  const edgeStream = await engine.queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?s ?dep WHERE {
       ?s ex:hasDependencyOn ?dep
     }`,
    { sources: [store] },
  )
  for await (const b of edgeStream) {
    const s = b.get('s')?.value
    const dep = b.get('dep')?.value
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

async function loadProject(id: string) {
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    const { store, engine } = await ensureRdf()

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
      const stream = await engine.queryBindings(
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
        { sources: [store] },
      )
      for await (const b of stream) {
        const uri = b.get('id')?.value
        if (!uri) continue
        project = {
          id: short(uri),
          uri,
          name: b.get('name')?.value ?? '',
          description: b.get('description')?.value ?? '',
          memberIds: [],
        }
        break
      }
    }

    if (project) {
      const memberIds: string[] = []
      const memberUris: string[] = []
      const mStream = await engine.queryBindings(
        `PREFIX ex: <${EX}>
         SELECT ?member WHERE { <${project.uri}> ex:member ?member }`,
        { sources: [store] },
      )
      for await (const b of mStream) {
        const member = b.get('member')?.value
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
        const mStream2 = await engine.queryBindings(
          `PREFIX ex: <${EX}>
           SELECT ?id ?name ?handle WHERE {
             VALUES ?id { ${values} }
             ?id a ex:Person ; ex:name ?name .
             OPTIONAL { ?id ex:forumHandle ?handle }
           }`,
          { sources: [store] },
        )
        const members: Person[] = []
        for await (const b of mStream2) {
          const pid = b.get('id')?.value
          const pname = b.get('name')?.value
          if (pid && pname)
            members.push(toPerson(pid, pname, b.get('handle')?.value))
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
  }
}
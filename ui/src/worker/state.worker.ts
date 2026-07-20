/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { Store, Parser } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import type { AppState, Command, SliceUpdate } from './protocol'
import type { Person } from '../data/people'
import type { Project } from '../data/projects'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
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
const AS = 'https://www.w3.org/ns/activitystreams#'

async function sparqlPeople(): Promise<Person[]> {
  const { store, engine } = await ensureRdf()
  const stream = await engine.queryBindings(
    `PREFIX as: <${AS}>
     SELECT ?id ?name ?avatar WHERE {
       ?id as:name ?name .
       OPTIONAL { ?id as:icon / as:url ?avatar }
     }`,
    { sources: [store] },
  )
  const people: Person[] = []
  for await (const b of stream) {
    const id = b.get('id')?.value
    const name = b.get('name')?.value
    if (id && name) {
      const shortId = id.replace(/^.*[/#]/, '')
      const avatar = b.get('avatar')?.value
      people.push({
        id: shortId,
        name,
        avatarUrl: avatar ?? `https://robohash.org/${shortId}?set=set4&size=128x128`,
      })
    }
  }
  return people
}

async function sparqlProjects(): Promise<Project[]> {
  const { store, engine } = await ensureRdf()
  const stream = await engine.queryBindings(
    `PREFIX as: <${AS}>
     SELECT ?id ?name ?description ?member WHERE {
       ?id a as:Project .
       OPTIONAL { ?id as:name ?name }
       OPTIONAL { ?id as:summary ?description }
       OPTIONAL { ?id as:member ?member }
     }`,
    { sources: [store] },
  )
  // Gather members per project
  const map = new Map<string, Project>()
  for await (const b of stream) {
    const id = b.get('id')?.value
    if (!id) continue
    const shortId = id.replace(/^.*[/#]/, '')
    if (!map.has(shortId)) {
      map.set(shortId, {
        id: shortId,
        name: b.get('name')?.value ?? '',
        description: b.get('description')?.value ?? '',
        memberIds: [],
      })
    }
    const member = b.get('member')?.value
    if (member) {
      const p = map.get(shortId)!
      const shortMember = member.replace(/^.*[/#]/, '')
      if (!p.memberIds.includes(shortMember)) p.memberIds.push(shortMember)
    }
  }
  return [...map.values()]
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
    state.projects = { status: 'error', data: state.projects.data, error: String(e) }
  }
  emit({ key: 'projects', value: state.projects })
}

async function loadProject(id: string) {
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    const { store, engine } = await ensureRdf()
    const stream = await engine.queryBindings(
      `PREFIX as: <${AS}>
       SELECT ?id ?name ?description ?member WHERE {
         BIND (<urn:project:${id}> AS ?id)
         OPTIONAL { ?id as:name ?name }
         OPTIONAL { ?id as:summary ?description }
         OPTIONAL { ?id as:member ?member }
       }`,
      { sources: [store] },
    )
    let project: Project | undefined
    const memberIds: string[] = []
    for await (const b of stream) {
      if (!project) {
        project = {
          id,
          name: b.get('name')?.value ?? '',
          description: b.get('description')?.value ?? '',
          memberIds: [],
        }
      }
      const member = b.get('member')?.value
      if (member) {
        const shortMember = member.replace(/^.*[/#]/, '')
        if (!memberIds.includes(shortMember)) memberIds.push(shortMember)
      }
    }
    if (project) {
      project.memberIds = memberIds
      state.projects = { status: 'ready', data: [project] }
      emit({ key: 'projects', value: state.projects })
    }

    // Load associated member people
    if (memberIds.length) {
      const mStream = await engine.queryBindings(
        `PREFIX as: <${AS}>
         SELECT ?id ?name ?avatar WHERE {
           VALUES ?id { ${memberIds.map((m) => `<urn:person:${m}>`).join(' ')} }
           ?id as:name ?name .
           OPTIONAL { ?id as:icon / as:url ?avatar }
         }`,
        { sources: [store] },
      )
      const members: Person[] = []
      for await (const b of mStream) {
        const pid = b.get('id')?.value?.replace(/^.*[/#]/, '')
        const pname = b.get('name')?.value
        if (pid && pname) {
          const avatar = b.get('avatar')?.value
      members.push({
        id: pid,
        name: pname,
        avatarUrl: avatar ?? `https://robohash.org/${pid}?set=set4&size=128x128`,
      })
        }
      }
      state.people = { status: 'ready', data: members }
      emit({ key: 'people', value: state.people })
    } else if (project) {
      // No members resolved, keep people slice as-is
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
  }
}

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { Store, Parser } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'
import w3capi, { type W3cApiUser } from 'node-w3capi/lib/w3capi.js'
import type {
  AppState,
  Command,
  Person,
  Project,
  SliceUpdate,
  Software,
  W3cGroup,
  W3cParticipant,
} from './protocol'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
  software: { status: 'idle', data: [] },
  w3cGroups: {
    status: 'idle',
    data: { groups: [], selected: [], common: [] },
  },
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
// W3C groups
// ---------------------------------------------------------------------------
// The catalog records the W3C API group id as ex:siloId "w3c:<group id>", so
// every group organization in the dump becomes selectable without hard-coding
// names or ids.
const W3C_SILO_PREFIX = 'w3c:'

const w3cAvatar = (id: string) =>
  `https://www.w3.org/thumbnails/100/avatar-images/${id}.webp?x-version=2`

const toW3cParticipant = (user: W3cApiUser): W3cParticipant => {
  const id = user.href.replace(/^.*\//, '')
  return {
    id,
    name: user.title,
    avatarUrl: w3cAvatar(id),
    former: user.former,
  }
}

// Participant lists are immutable for the worker's lifetime: toggling a group
// off and on again must not hit the API a second time.
const participantCache = new Map<number, W3cParticipant[]>()
const participantRequests = new Map<number, Promise<W3cParticipant[]>>()

function participantsFor(groupId: number): Promise<W3cParticipant[]> {
  const cached = participantCache.get(groupId)
  if (cached) return Promise.resolve(cached)
  const inflight = participantRequests.get(groupId)
  if (inflight) return inflight

  const request = w3capi
    .group(groupId)
    .users()
    .fetch()
    .then((users) => {
      // Defensive: the API could list the same user more than once.
      const unique = new Map(users.map((u) => [u.href, toW3cParticipant(u)]))
      const participants = [...unique.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
      participantCache.set(groupId, participants)
      return participants
    })
    .finally(() => participantRequests.delete(groupId))

  participantRequests.set(groupId, request)
  return request
}

async function sparqlW3cGroups(): Promise<W3cGroup[]> {
  const { store, engine } = await ensureRdf()
  const stream = await engine.queryBindings(
    `PREFIX ex: <${EX}>
     SELECT ?uri ?name ?siloId WHERE {
       ?uri a ex:Organization ; ex:name ?name ; ex:siloId ?siloId .
       FILTER (STRSTARTS(STR(?siloId), "${W3C_SILO_PREFIX}"))
     }`,
    { sources: [store] },
  )
  const groups: W3cGroup[] = []
  for await (const b of stream) {
    const uri = b.get('uri')?.value
    const name = b.get('name')?.value
    const siloId = b.get('siloId')?.value
    if (!uri || !name || !siloId) continue
    const id = Number(siloId.slice(W3C_SILO_PREFIX.length))
    if (!Number.isInteger(id)) continue
    groups.push({ id, uri, name, participants: [] })
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

// Intersection of every selected group's participant list. With fewer than two
// groups there is no intersection; the view shows the single group instead.
function commonParticipants(
  groups: W3cGroup[],
  selected: number[],
): W3cParticipant[] {
  const chosen = groups.filter((g) => selected.includes(g.id))
  if (chosen.length < 2) return []
  const commonIds = chosen
    .map((g) => new Set(g.participants.map((p) => p.id)))
    .reduce((a, b) => a.intersection(b))
  return chosen[0].participants
    .filter((p) => commonIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Commands are not serialized: a toggle starts its participant loads and
// returns to the mailbox, so a later command can finish before an earlier one.
// Each command takes a token here and only the flow that is still the latest
// may write state, otherwise an older flow would publish its stale selection.
// Stale flows are not wasted work: they fill the participant cache the newest
// flow is awaiting.
let w3cSelectionVersion = 0

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

async function loadW3cGroups() {
  if (state.w3cGroups.status === 'loading') return
  const version = ++w3cSelectionVersion
  state.w3cGroups = { status: 'loading', data: state.w3cGroups.data }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
  try {
    const found = await sparqlW3cGroups()
    // Start with every group in the catalog selected, so the intersection is
    // visible as soon as the page opens; the checkboxes can undo that.
    const selected = found.map((g) => g.id)
    state.w3cGroups = {
      status: 'loading',
      data: { groups: found, selected, common: [] },
    }
    emit({ key: 'w3cGroups', value: state.w3cGroups })

    const groups = await Promise.all(
      found.map(async (g) => ({
        ...g,
        participants: await participantsFor(g.id),
      })),
    )
    if (version !== w3cSelectionVersion) return
    state.w3cGroups = {
      status: 'ready',
      data: { groups, selected, common: commonParticipants(groups, selected) },
    }
  } catch (e) {
    if (version !== w3cSelectionVersion) return
    state.w3cGroups = {
      status: 'error',
      data: state.w3cGroups.data,
      error: String(e),
    }
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
}

async function toggleW3cGroup(id: number) {
  const data = state.w3cGroups.data
  if (!data.groups.some((g) => g.id === id)) return
  const version = ++w3cSelectionVersion
  const selected = data.selected.includes(id)
    ? data.selected.filter((x) => x !== id)
    : [...data.selected, id]

  state.w3cGroups = {
    status: 'loading',
    data: {
      ...data,
      selected,
      common: commonParticipants(
        data.groups.map((g) => ({
          ...g,
          participants: participantCache.get(g.id) ?? g.participants,
        })),
        selected,
      ),
    },
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })

  try {
    // Cached groups resolve immediately; only a group whose fetch failed (or
    // was never selected) hits the API here.
    const groups = await Promise.all(
      data.groups.map(async (g) => ({
        ...g,
        participants: await participantsFor(g.id),
      })),
    )
    if (version !== w3cSelectionVersion) return
    state.w3cGroups = {
      status: 'ready',
      data: { groups, selected, common: commonParticipants(groups, selected) },
    }
  } catch (e) {
    if (version !== w3cSelectionVersion) return
    state.w3cGroups = {
      status: 'error',
      data: state.w3cGroups.data,
      error: String(e),
    }
  }
  emit({ key: 'w3cGroups', value: state.w3cGroups })
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
    case 'loadW3cGroups':
      loadW3cGroups()
      break
    case 'toggleW3cGroup':
      toggleW3cGroup(e.data.id)
      break
  }
}
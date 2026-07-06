/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

import { people as dbPeople } from '../data/people'
import { projects as dbProjects } from '../data/projects'
import type { AppState, Command, SliceUpdate } from './protocol'

// The actor's authoritative state. Slices start empty/idle and are filled on
// demand as pages request them.
const state: AppState = {
  people: { status: 'idle', data: [] },
  projects: { status: 'idle', data: [] },
}

const emit = (u: SliceUpdate) => self.postMessage(u)

// MOCK network latency. When wiring a real API, delete this and await fetch().
const delay = () => new Promise((r) => setTimeout(r, 300))

const upsert = <T extends { id: string }>(list: T[], items: T[]) => {
  const byId = new Map(list.map((x) => [x.id, x]))
  for (const it of items) byId.set(it.id, it)
  return [...byId.values()]
}

async function loadPeople() {
  if (state.people.status === 'loading') return
  state.people = { status: 'loading', data: state.people.data }
  emit({ key: 'people', value: state.people })
  try {
    await delay() // -> const data = await (await fetch('/api/people')).json()
    state.people = { status: 'ready', data: dbPeople }
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
    await delay() // -> const data = await (await fetch('/api/projects')).json()
    state.projects = { status: 'ready', data: dbProjects }
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
  }
  emit({ key: 'projects', value: state.projects })
}

async function loadProject(id: string) {
  // Load the project AND ensure its member people are present (the join).
  state.projects = { status: 'loading', data: state.projects.data }
  emit({ key: 'projects', value: state.projects })
  try {
    await delay() // -> const project = await (await fetch(`/api/projects/${id}`)).json()
    const project = dbProjects.find((p) => p.id === id)
    state.projects = {
      status: 'ready',
      data: project
        ? upsert(state.projects.data, [project])
        : state.projects.data,
    }
    emit({ key: 'projects', value: state.projects })

    const members = dbPeople.filter((p) => project?.memberIds.includes(p.id))
    state.people = { status: 'ready', data: upsert(state.people.data, members) }
    emit({ key: 'people', value: state.people })
  } catch (e) {
    state.projects = {
      status: 'error',
      data: state.projects.data,
      error: String(e),
    }
    emit({ key: 'projects', value: state.projects })
  }
}

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

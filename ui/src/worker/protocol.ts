import type { Person } from '../data/people'
import type { Project } from '../data/projects'

export type { Person, Project }

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'
export type AsyncSlice<T> = { status: AsyncStatus; data: T; error?: string }

export type AppState = {
  people: AsyncSlice<Person[]>
  projects: AsyncSlice<Project[]>
}

// main -> worker (the actor mailbox): load on demand
export type Command =
  | { type: 'loadPeople' }
  | { type: 'loadProjects' }
  | { type: 'loadProject'; id: string }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate =
  | { key: 'people'; value: AppState['people'] }
  | { key: 'projects'; value: AppState['projects'] }

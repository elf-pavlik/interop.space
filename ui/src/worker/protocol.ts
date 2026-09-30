// Shared actor protocol types (main thread + worker).

export type Person = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  avatarUrl: string
  handle?: string // ex:forumHandle when present
}

export type Project = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  description: string
  memberIds: string[] // short ids referencing Person.id
}

export type Software = {
  id: string // short display/URL form (tail of the catalog URI)
  uri: string // full catalog URI
  name: string
  dependencies: string[] // names of linked software (ex:hasDependencyOn targets)
}

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'
export type AsyncSlice<T> = { status: AsyncStatus; data: T; error?: string }

export type AppState = {
  people: AsyncSlice<Person[]>
  projects: AsyncSlice<Project[]>
  software: AsyncSlice<Software[]>
}

// main -> worker (the actor mailbox): load on demand
export type Command =
  | { type: 'loadPeople' }
  | { type: 'loadProjects' }
  | { type: 'loadProject'; id: string }
  | { type: 'loadSoftware' }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate =
  | { key: 'people'; value: AppState['people'] }
  | { key: 'projects'; value: AppState['projects'] }
  | { key: 'software'; value: AppState['software'] }
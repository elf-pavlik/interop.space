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

export type W3cParticipant = {
  id: string // W3C API user id (tail of the user href)
  name: string
  avatarUrl: string
  former: boolean
}

export type W3cGroup = {
  id: number // W3C API group id, from the catalog's ex:siloId "w3c:<id>"
  uri: string // full catalog URI of the organization
  name: string
  participants: W3cParticipant[]
}

export type W3cGroupsData = {
  groups: W3cGroup[]
  selected: number[] // W3cGroup.id values the user has checked
  common: W3cParticipant[] // intersection of the selected groups' participants
}

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error'
export type AsyncSlice<T> = { status: AsyncStatus; data: T; error?: string }

export type AppState = {
  people: AsyncSlice<Person[]>
  projects: AsyncSlice<Project[]>
  software: AsyncSlice<Software[]>
  w3cGroups: AsyncSlice<W3cGroupsData>
}

// main -> worker (the actor mailbox): load on demand
export type Command =
  | { type: 'loadPeople' }
  | { type: 'loadProjects' }
  | { type: 'loadProject'; id: string }
  | { type: 'loadSoftware' }
  | { type: 'loadW3cGroups' }
  | { type: 'toggleW3cGroup'; id: number }

// worker -> main: one slice at a time (partial snapshot)
export type SliceUpdate =
  | { key: 'people'; value: AppState['people'] }
  | { key: 'projects'; value: AppState['projects'] }
  | { key: 'software'; value: AppState['software'] }
  | { key: 'w3cGroups'; value: AppState['w3cGroups'] }
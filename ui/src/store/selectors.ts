import { appState } from './app'
import type { Person } from '../worker/protocol'
import type { Project } from '../worker/protocol'
import type { W3cGroup } from '../worker/protocol'
import type { Specification } from '../worker/protocol'

export const peopleSlice = () => appState.people
export const projectsSlice = () => appState.projects
export const softwareSlice = () => appState.software
export const specificationsSlice = () => appState.specifications
export const w3cGroupsSlice = () => appState.w3cGroups

export const groupById = (id: number): W3cGroup | undefined =>
  appState.w3cGroups.data.groups.find((g) => g.id === id)

export const groupByName = (name: string): W3cGroup | undefined =>
  appState.w3cGroups.data.groups.find((g) => g.name === name)

// Person and group participants are the same ex:Person node, so the join is on
// the full catalog URI.
export const groupsOfPerson = (person: Person): W3cGroup[] =>
  appState.w3cGroups.data.groups.filter((g) =>
    g.participants.some((p) => p.uri === person.uri),
  )

export const specificationById = (id: string): Specification | undefined =>
  appState.specifications.data.find((s) => s.id === id)

// Specifications carry their delivering groups by name (ex:specification on
// the organization), so the join is on the group name.
export const specificationsOf = (groupName: string): Specification[] =>
  appState.specifications.data.filter((s) => s.groups.includes(groupName))

export const projectById = (id: string): Project | undefined =>
  appState.projects.data.find((p) => p.id === id)

export const personById = (id: string): Person | undefined =>
  appState.people.data.find((p) => p.id === id)

// people/projects join, reactive over both slices
export const membersOf = (id: string): Person[] => {
  const project = projectById(id)
  if (!project) return []
  const byId = new Map(appState.people.data.map((p) => [p.id, p]))
  return project.memberIds
    .map((pid) => byId.get(pid))
    .filter(Boolean) as Person[]
}
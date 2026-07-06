import { appState } from './app'
import type { Person } from '../data/people'
import type { Project } from '../data/projects'

export const peopleSlice = () => appState.people
export const projectsSlice = () => appState.projects

export const projectById = (id: string): Project | undefined =>
  appState.projects.data.find((p) => p.id === id)

// people/projects join, reactive over both slices
export const membersOf = (id: string): Person[] => {
  const project = projectById(id)
  if (!project) return []
  const byId = new Map(appState.people.data.map((p) => [p.id, p]))
  return project.memberIds
    .map((pid) => byId.get(pid))
    .filter(Boolean) as Person[]
}

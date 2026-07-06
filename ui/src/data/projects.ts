export type Project = {
  id: string
  name: string
  description: string
  memberIds: string[] // references Person.id
}

export const projects: Project[] = [
  {
    id: 'analytical-engine',
    name: 'Analytical Engine',
    description: 'The first general-purpose mechanical computer.',
    memberIds: ['ada', 'grace'],
  },
  {
    id: 'enigma',
    name: 'Enigma',
    description: 'Codebreaking and early computation.',
    memberIds: ['alan', 'margaret'],
  },
  {
    id: 'unix',
    name: 'Unix',
    description: 'The operating system and its lineage.',
    memberIds: ['dennis', 'linus', 'grace'],
  },
]

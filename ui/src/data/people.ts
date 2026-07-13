import type { Profile } from '../gen/profile'

export type Person = Profile & {
  avatarUrl: string
}

const robohash = (seed: string) =>
  `https://robohash.org/${seed}?set=set4&size=128x128`

export const people: Person[] = [
  { id: 'ada', name: 'Ada Lovelace', avatarUrl: robohash('ada') },
  { id: 'alan', name: 'Alan Turing', avatarUrl: robohash('alan') },
  { id: 'grace', name: 'Grace Hopper', avatarUrl: robohash('grace') },
  { id: 'linus', name: 'Linus Torvalds', avatarUrl: robohash('linus') },
  { id: 'margaret', name: 'Margaret Hamilton', avatarUrl: robohash('margaret') },
  { id: 'dennis', name: 'Dennis Ritchie', avatarUrl: robohash('dennis') },
]

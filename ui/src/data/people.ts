export type Person = {
  id: string
  name: string
  avatarUrl: string
}

const robohash = (seed: string) =>
  `https://robohash.org/${seed}?set=set4&size=128x128`

export const people: Person[] = [
  { id: 'ada', name: 'Ada Lovelace', avatarUrl: robohash('ada') },
  { id: 'alan', name: 'Alan Turing', avatarUrl: robohash('alan') },
  { id: 'grace', name: 'Grace Hopper', avatarUrl: robohash('grace') },
]

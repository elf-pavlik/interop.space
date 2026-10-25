// Canonical W3C person identifiers. Some people have more than one W3C API
// account; the duplicate ids are mapped to the maintained account so the graph
// never keeps two person subjects for the same individual.
const DUPLICATE_W3C_IDS = new Map<number, number>([
  // Pierre-Antoine Champin: 129656 is the canonical account, 42931 is the
  // older duplicate. All references to 42931 are rewritten to 129656.
  [42931, 129656],
])

export const W3C_PERSON_URN_PREFIX = 'urn:w3c:person:'

export function canonicalW3cId(w3cId: number): number {
  return DUPLICATE_W3C_IDS.get(w3cId) ?? w3cId
}

export function isDuplicateW3cId(w3cId: number): boolean {
  return DUPLICATE_W3C_IDS.has(w3cId)
}

export function personUrn(w3cId: number): string {
  return `${W3C_PERSON_URN_PREFIX}${canonicalW3cId(w3cId)}`
}

/** Canonical URN for an existing person URI. */
export function canonicalPersonUri(uri: string): string {
  const match = /^urn:w3c:person:(\d+)$/.exec(uri)
  return match ? personUrn(Number(match[1])) : uri
}

/** Whether a person URI is one of the known duplicate accounts. */
export function isDuplicatePersonUri(uri: string): boolean {
  const match = /^urn:w3c:person:(\d+)$/.exec(uri)
  return match ? isDuplicateW3cId(Number(match[1])) : false
}

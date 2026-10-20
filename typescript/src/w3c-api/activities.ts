// Temporal activities for the W3C API workflow. Network I/O and RDF building
// live here; the workflow stays deterministic and only sequences.
import w3capi from 'node-w3capi'
import pThrottle from 'p-throttle'
import { endpointFor } from '../software-dependencies/activities.ts'
import {
  buildParticipantQuads,
  readW3cCatalog,
  serializeQuads,
} from './analysis.ts'
import type { W3cGroupParticipants, W3cGroupRef, W3cParticipant } from './analysis.ts'
import type { W3cApiUserDetail } from 'node-w3capi'

// Seeding the catalog is shared with the dependency workflow: both need the
// same catalog in the store before adding their own statements.
export { loadCatalog, seedCatalog } from '../software-dependencies/activities.ts'

/** The W3C groups the catalog carries, in catalog order. */
export async function listW3cGroups(ttl: string): Promise<W3cGroupRef[]> {
  const { groups } = await readW3cCatalog(ttl)
  return groups
}

// api.w3.org has no batch user endpoint, so a group of 300+ participants means
// one request per participant. Rate-limit them: the throttle is module-level,
// so the per-group activities share one budget.
const throttledUserFetch = pThrottle({ limit: 10, interval: 1000 })

const fetchW3cUser = throttledUserFetch(async (href: string) => {
  const detail = await w3capi.user(href.replace(/^.*\//, '')).fetch()
  return {
    id: detail.id,
    href,
    name: detail.name,
    photo: pickPhoto(detail),
  } satisfies W3cParticipant
})

/**
 * Participants of one W3C group, as api.w3.org lists them.
 *
 * The group listing only carries the opaque user URI, while the catalog keys
 * people on the numeric W3C user id, so each participant's own resource is
 * fetched as well; it also carries the profile photo. Without that lookup the
 * catalog people would be forked into a second record per group membership.
 */
export async function fetchW3cParticipants(
  groupId: number,
): Promise<W3cParticipant[]> {
  const users = await w3capi.group(groupId).users().fetch()
  const participants = await Promise.all(
    users.map((user) => fetchW3cUser(user.href)),
  )
  return participants.sort((a, b) => a.name.localeCompare(b.name))
}

/** The API's thumbnail photo for a user, when the account has one. */
function pickPhoto(user: W3cApiUserDetail): string | undefined {
  const photos = user._links?.photos ?? []
  return (photos.find((photo) => photo.name === 'thumbnail') ?? photos[0])?.href
}

/**
 * Add the participants to the store as ex:Person records linked with
 * ex:member. The catalog TTL is parsed again here (not passed as quads) so
 * people the catalog already knows keep their URI and name.
 */
export async function storeW3cParticipants(
  ttl: string,
  groups: W3cGroupParticipants[],
): Promise<string> {
  const { personUris } = await readW3cCatalog(ttl)
  const quads = buildParticipantQuads(groups, personUris)
  const nquads = serializeQuads(quads)
  const endpoint = endpointFor('store')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/n-quads' },
    body: nquads,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to store W3C participants to ${endpoint}: HTTP ${response.status} ${response.statusText}`,
    )
  }
  const people = new Set(
    groups.flatMap((g) => g.participants.map((p) => p.id)),
  ).size
  return `Stored ${quads.length} quads for ${people} participants in ${groups.length} groups`
}

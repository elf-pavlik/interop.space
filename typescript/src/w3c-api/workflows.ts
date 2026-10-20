// Temporal workflow that enriches the catalog store with W3C group
// participants. The catalog itself is seeded by the shared activities from
// software-dependencies; this workflow adds what api.w3.org knows about the
// groups the catalog already lists.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const {
  loadCatalog,
  listW3cGroups,
  fetchW3cParticipants,
  seedCatalog,
  storeW3cParticipants,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
  },
})

export interface W3cApiResult {
  source: string
  groups: number
  participants: number
  stored: string
}

export async function w3cApiWorkflow(): Promise<W3cApiResult> {
  const { ttl, source } = await loadCatalog()
  const groups = await listW3cGroups(ttl)
  // One activity per group: a failing group retries on its own.
  const fetched = await Promise.all(
    groups.map(async (group) => ({
      group,
      participants: await fetchW3cParticipants(group.id),
    })),
  )
  await seedCatalog(ttl)
  const stored = await storeW3cParticipants(ttl, fetched)
  return {
    source,
    groups: groups.length,
    participants: fetched.reduce((n, g) => n + g.participants.length, 0),
    stored,
  }
}

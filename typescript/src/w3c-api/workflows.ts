// Temporal workflow that grows the dump with W3C group data. The previous dump
// (or a single fallback GitHub account) seeds the graph. Upstream data is
// treated as frozen, so existence means fetched: people already linked to a
// W3C group are skipped, groups already present are skipped, and only groups
// without any ex:specification link get their specs fetched.
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { CitationReport } from '../citations/report.ts'

const {
  loadSeed,
  listW3cUserGroups,
  fetchW3cParticipants,
  fetchW3cSpecifications,
  seedBase,
  storeW3cData,
  storeW3cCitations,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
})

export interface W3cApiResult {
  source: string
  people: number
  /** People with no W3C group in the seed; only these were crawled. */
  pendingPeople: number
  knownGroups: number
  /** Groups fetched in this run (those the seed did not have yet). */
  groups: number
  participants: number
  /** Groups checked for specifications in this run. */
  specGroups: number
  specifications: number
  stored: string
  citations: { summary: string; report: CitationReport }
}

export async function w3cApiWorkflow(): Promise<W3cApiResult> {
  const seed = await loadSeed()
  const { groups, specificationGroups } = await listW3cUserGroups(seed)

  // One activity per group: a failing group retries on its own. Specs for
  // groups that already have them are never requested.
  const [fetched, specs] = await Promise.all([
    Promise.all(
      groups.map(async (group) => ({
        group,
        participants: await fetchW3cParticipants(group.id),
      })),
    ),
    Promise.all(
      specificationGroups.map(async (group) => ({
        group,
        specifications: await fetchW3cSpecifications(group.id),
      })),
    ),
  ])

  await seedBase(seed)
  const stored = await storeW3cData(seed, fetched, specs)
  const citations = await storeW3cCitations()
  return {
    source: seed.source,
    people: seed.people,
    pendingPeople: seed.pendingPeople,
    knownGroups: seed.knownGroups,
    groups: groups.length,
    participants: fetched.reduce((n, g) => n + g.participants.length, 0),
    specGroups: specificationGroups.length,
    specifications: specs.reduce((n, g) => n + g.specifications.length, 0),
    stored,
    citations,
  }
}

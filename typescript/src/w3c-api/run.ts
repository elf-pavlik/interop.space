// Standalone CLI (no Temporal): reads the previous dump (or starts from the
// fallback GitHub account), crawls people with no W3C group yet, fetches only
// the groups the dump does not contain, and fetches specs for groups that have
// none. Prints the new RDF (N-Quads) to stdout; a summary goes to stderr.
//
// Usage:
//   bun run src/w3c-api/run.ts                    # ui/public/dump.nq
//   bun run src/w3c-api/run.ts <dump.nq>          # local dump
//   DUMP_PATH=<dump.nq> bun run src/w3c-api/run.ts
import { parseArgs } from 'node:util'
import {
  fetchW3cParticipants,
  fetchW3cSpecifications,
  listW3cUserGroups,
  loadSeed,
  readSeed,
} from './activities.ts'
import {
  buildSpecificationQuads,
  buildW3cQuads,
  readDataset,
  serializeQuads,
} from './analysis.ts'

export async function main(argv: string[]): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true })
  if (positionals[0]) process.env.DUMP_PATH = positionals[0]

  const seed = await loadSeed()
  const { groups, specificationGroups } = await listW3cUserGroups(seed)
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

  const { personUris } = await readDataset(await readSeed(seed))
  const quads = [
    ...buildW3cQuads(fetched, personUris),
    ...buildSpecificationQuads(specs),
  ]
  for (const quad of serializeQuads(quads).trimEnd().split('\n')) {
    console.log(quad)
  }

  console.error(`seed: ${seed.source}`)
  console.error(
    `people: ${seed.people}, pending people: ${seed.pendingPeople}, known groups: ${seed.knownGroups}`,
  )
  console.error(`new W3C groups: ${groups.length}`)
  console.error(
    `spec checks: ${specificationGroups.length} groups, ${specs.reduce((n, g) => n + g.specifications.length, 0)} specs`,
  )
  for (const { group, participants } of fetched) {
    const known = participants.filter((p) => personUris.has(`w3c:${p.id}`)).length
    console.error(
      `  ${group.name} (w3c:${group.id}): ${participants.length} participants (${known} already in the seed)`,
    )
  }
  console.error(`quads: ${quads.length}`)
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}

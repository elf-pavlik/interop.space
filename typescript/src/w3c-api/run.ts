// Standalone CLI (no Temporal): reads the catalog, fetches the participants of
// every W3C group it lists from api.w3.org, and prints the resulting RDF
// (N-Quads) to stdout. A summary goes to stderr.
//
// Usage:
//   bun run src/w3c-api/run.ts                    # downloads catalog-data.ttl
//   bun run src/w3c-api/run.ts <catalog.ttl>      # local catalog
//   bun run src/w3c-api/run.ts --url <url>        # remote catalog
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { DEFAULT_CATALOG_URL } from '../software-dependencies/activities.ts'
import { fetchW3cParticipants } from './activities.ts'
import { buildParticipantQuads, readW3cCatalog, serializeQuads } from './analysis.ts'

async function loadTtl(args: { path?: string; url?: string }): Promise<{ ttl: string; source: string }> {
  if (args.path) {
    return { ttl: await readFile(args.path, 'utf-8'), source: args.path }
  }
  const url = args.url ?? DEFAULT_CATALOG_URL
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download catalog from ${url}: HTTP ${response.status}`)
  }
  return { ttl: await response.text(), source: url }
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { url: { type: 'string' } },
  })

  const { ttl, source } = await loadTtl({ path: positionals[0], url: values.url })
  const { groups, personUris } = await readW3cCatalog(ttl)
  const fetched = await Promise.all(
    groups.map(async (group) => ({
      group,
      participants: await fetchW3cParticipants(group.id),
    })),
  )

  const quads = buildParticipantQuads(fetched, personUris)
  for (const quad of serializeQuads(quads).trimEnd().split('\n')) {
    console.log(quad)
  }

  console.error(`catalog: ${source}`)
  console.error(`W3C groups: ${groups.length}`)
  for (const { group, participants } of fetched) {
    const known = participants.filter((p) => personUris.has(`w3c:${p.id}`)).length
    console.error(
      `  ${group.name} (w3c:${group.id}): ${participants.length} participants (${known} already in the catalog)`,
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

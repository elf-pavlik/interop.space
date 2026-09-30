// Standalone CLI (no Temporal): parses the catalog TTL, fetches each
// repository's package.json, and prints only the NEW ex:hasDependencyOn
// statements (N-Triples) to stdout. A summary goes to stderr.
//
// Usage:
//   bun run src/software-dependencies/run.ts <catalog.ttl>          # local file
//   bun run src/software-dependencies/run.ts --url <url>            # remote TTL
//   bun run src/software-dependencies/run.ts                        # downloads catalog-data.ttl
//   bun run src/software-dependencies/run.ts <file> --concurrency 5
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { enumerateSoftware, parseCatalogDataset, analyzeSoftwareDependencies, HAS_DEPENDENCY_ON, existingDependencyStatements } from './analysis.ts'
import { fetchAllPackageJson } from './fetch.ts'

export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/elf-pavlik/solid-efforts-core/refs/heads/main/catalog-data.ttl'

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
    options: {
      'url': { type: 'string' },
      'concurrency': { type: 'string' },
    },
  })

  const concurrency = values.concurrency ? Number(values.concurrency) : 5
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Invalid --concurrency: ${values.concurrency}`)
  }

  const { ttl, source } = await loadTtl({ path: positionals[0], url: values.url })

  // Enumerate software + repositories.
  const store = await parseCatalogDataset(ttl)
  const entries = await enumerateSoftware(store)
  const existing = existingDependencyStatements(store)
  const withRepo = entries.filter((e) => e.repositories.length > 0)
  const allRepos = [...new Set(withRepo.flatMap((e) => e.repositories))]

  // Fetch package.json from every repository (bounded concurrency).
  const repoResults = await fetchAllPackageJson(allRepos, concurrency)

  // Compute the delta.
  const analysis = await analyzeSoftwareDependencies(ttl, repoResults)

  // Verify no overlap with pre-existing statements.
  const existingKeys = new Set(existing)
  const duplicates = analysis.statements.filter((s) => existingKeys.has(s))

  // Delta to stdout.
  for (const statement of analysis.statements) {
    console.log(statement)
  }

  // Summary to stderr.
  const mapped = analysis.packageMap.size
  const failedRepos = [...repoResults.entries()].filter(([, r]) => !r.ok)
  const unmatchedCount = [...analysis.unmatched.values()].reduce((n, deps) => n + deps.length, 0)
  console.error(`catalog: ${source}`)
  console.error(`software records: ${entries.length} (with repository: ${withRepo.length})`)
  console.error(`repositories: ${allRepos.length} distinct (fetched, ${failedRepos.length} skipped)`)
  console.error(`software mapped to package.json: ${mapped}`)
  console.error(`existing hasDependencyOn statements: ${existing.size}`)
  console.error(`new hasDependencyOn statements: ${analysis.statements.length}`)
  if (duplicates.length > 0) {
    console.error(`WARNING: ${duplicates.length} new statements duplicate existing ones`)
  }
  console.error(`unmatched dependency names: ${unmatchedCount}`)
  if (failedRepos.length > 0) {
    console.error('skipped repositories:')
    for (const [repo, result] of failedRepos) {
      console.error(`  ${repo}  (${result.ok ? '' : result.reason})`)
    }
  }
  const unmatchedSample = [...analysis.unmatched.entries()].slice(0, 5)
  if (unmatchedSample.length > 0) {
    console.error('sample of software with unmatched dependency names:')
    for (const [uri, deps] of unmatchedSample) {
      console.error(`  ${uri}  (${deps.join(', ')})`)
    }
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
// Temporal workflow orchestrating the catalog dependency analysis.
// All I/O and parsing happens in activities; this workflow only sequences
// them, so it stays deterministic (safe under replay).
import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const {
  loadCatalog,
  parseCatalog,
  fetchPackageJsons,
  computeStatements,
  seedCatalog,
  applyDependencyUpdate,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
  },
})

export interface CatalogDependencyResult {
  source: string
  statementCount: number
  applied: string
}

export async function catalogDependencyWorkflow(): Promise<CatalogDependencyResult> {
  const { ttl, source } = await loadCatalog()
  const entries = await parseCatalog(ttl)
  const repos = [...new Set(entries.flatMap((e) => e.repositories))]
  const fetches = await fetchPackageJsons(repos)
  const statements = await computeStatements(ttl, fetches)
  await seedCatalog(ttl)
  const applied = await applyDependencyUpdate(statements)
  return { source, statementCount: statements.length, applied }
}
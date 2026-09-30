// Temporal activities for the catalog dependency workflow.
// All network I/O and heavy parsing lives here; the workflow stays
// deterministic and only orchestrates via proxyActivities.
import { readFile } from 'node:fs/promises'
import { Writer } from 'n3'
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint'
import { analyzeSoftwareDependencies, enumerateSoftware, parseCatalogDataset } from './analysis.ts'
import { fetchAllPackageJson } from './fetch.ts'
import type { SoftwareEntry } from './analysis.ts'

export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/elf-pavlik/solid-efforts-core/refs/heads/main/catalog-data.ttl'

export interface CatalogDocument {
  ttl: string
  source: string
}

export interface RepoFetch {
  repo: string
  ok: boolean
  reason?: string
  name?: string
  deps?: string[]
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

/**
 * The nginx proxy in Dagger routes every operation through one
 * SPARQL_ENDPOINT (http://sparql/sparql). Direct Oxigraph needs the
 * operation-specific path (/store, /update). The overrides let both work.
 */
function endpointFor(op: 'store' | 'update' | 'query'): string {
  return process.env[`SPARQL_${op.toUpperCase()}_ENDPOINT`] ?? requireEnv('SPARQL_ENDPOINT')
}

/** Load the catalog TTL from CATALOG_PATH, CATALOG_URL, or the default URL. */
export async function loadCatalog(): Promise<CatalogDocument> {
  const path = process.env.CATALOG_PATH
  const url = process.env.CATALOG_URL ?? DEFAULT_CATALOG_URL
  if (path) {
    return { ttl: await readFile(path, 'utf-8'), source: path }
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download catalog from ${url}: HTTP ${response.status}`)
  }
  return { ttl: await response.text(), source: url }
}

/** Parse the catalog TTL and enumerate software entries with their repositories. */
export async function parseCatalog(ttl: string): Promise<SoftwareEntry[]> {
  const store = await parseCatalogDataset(ttl)
  return enumerateSoftware(store)
}

/** Fetch package.json from the given repositories (bounded concurrency inside). */
export async function fetchPackageJsons(repos: string[]): Promise<RepoFetch[]> {
  const results = await fetchAllPackageJson(repos)
  return [...results.entries()].map(([repo, result]) =>
    result.ok
      ? { repo, ok: true, name: result.name, deps: result.deps }
      : { repo, ok: false, reason: result.reason },
  )
}

/** Compute the new ex:hasDependencyOn statements for the catalog. */
export async function computeStatements(
  ttl: string,
  fetches: RepoFetch[],
): Promise<string[]> {
  const repoResults = new Map(fetches.map((f) => [f.repo, f] as const))
  const analysis = await analyzeSoftwareDependencies(ttl, repoResults)
  return analysis.statements
}

/**
 * Drop N-Quads lines whose IRIs are invalid per RFC 3987 (more than one
 * '#', which Oxigraph rejects; N3 serializes them as-is from the catalog).
 */
export function sanitizeNQuads(nquads: string): { quads: string; dropped: number } {
  const kept: string[] = []
  let dropped = 0
  for (const line of nquads.split('\n')) {
    const iris = line.match(/<([^>]*)>/g)
    const invalid = iris?.some((iri) => (iri.slice(1, -1).match(/#/g)?.length ?? 0) > 1) ?? false
    if (invalid) {
      dropped++
    } else {
      kept.push(line)
    }
  }
  return { quads: kept.join('\n'), dropped }
}

/** Serialize the catalog TTL to N-Quads and load it into the SPARQL store. */
export async function seedCatalog(ttl: string): Promise<string> {
  const endpoint = endpointFor('store')
  const store = await parseCatalogDataset(ttl)
  const nquads = new Writer().quadsToString(store.getQuads(null, null, null, null))
  const { quads, dropped } = sanitizeNQuads(nquads)
  if (dropped > 0) {
    console.warn(`seedCatalog: dropped ${dropped} quads with invalid IRIs`)
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/n-quads' },
    body: quads,
  })
  if (!response.ok) {
    throw new Error(`Failed to seed catalog to ${endpoint}: HTTP ${response.status} ${response.statusText}`)
  }
  return 'Catalog seeded successfully'
}

/** Apply the delta statements with a SPARQL UPDATE INSERT DATA. */
export async function applyDependencyUpdate(statements: string[]): Promise<string> {
  const endpoint = endpointFor('update')
  if (statements.length === 0) {
    return 'No statements to apply'
  }
  const update = `INSERT DATA { ${statements.join(' ')} }`
  const fetcher = new SparqlEndpointFetcher()
  await fetcher.fetchUpdate(endpoint, update)
  return `Applied ${statements.length} hasDependencyOn statements`
}
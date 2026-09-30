// Pure analysis: parse the catalog TTL, enumerate software + repositories,
// fetch package metadata, and compute ex:hasDependencyOn statements.
import { Parser, Store } from 'n3'
import { QueryEngine } from '@comunica/query-sparql-rdfjs'

export const EX = 'http://example.org#'
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
export const SOFTWARE_TYPE = `${EX}Software`
export const REPOSITORY = `${EX}repository`
export const HAS_DEPENDENCY_ON = `${EX}hasDependencyOn`

export interface SoftwareEntry {
  uri: string
  repositories: string[]
}

export interface PackageData {
  name: string
  deps: string[]
}

export interface FetchResultLike {
  ok: boolean
  name?: string
  deps?: string[]
}

export interface AnalysisResult {
  entries: SoftwareEntry[]
  /** Software URI -> merged package metadata (from all its repositories). */
  packageMap: Map<string, PackageData>
  /** Newly computed ex:hasDependencyOn statements as N-Triples (excluding existing ones). */
  statements: string[]
  /** Software URI -> dependency names that matched no catalog software package. */
  unmatched: Map<string, string[]>
}

let engine: QueryEngine | undefined

function queryEngine(): QueryEngine {
  engine ??= new QueryEngine()
  return engine
}

/** Parse a TTL document into an in-memory N3 store. */
export function parseCatalogDataset(ttl: string): Promise<Store> {
  return new Promise((resolve, reject) => {
    const store = new Store()
    new Parser().parse(ttl, (error, quad) => {
      if (error) {
        reject(error)
      } else if (quad) {
        store.addQuad(quad)
      } else {
        resolve(store)
      }
    })
  })
}

/**
 * Enumerate every resource typed ex:Software together with all of its
 * ex:repository values (software without a repository are included with an
 * empty repositories array).
 */
export async function enumerateSoftware(store: Store): Promise<SoftwareEntry[]> {
  const query = `
SELECT ?software ?repo WHERE {
  ?software <${RDF_TYPE}> <${SOFTWARE_TYPE}> .
  OPTIONAL { ?software <${REPOSITORY}> ?repo }
}`
  const bindings = await queryEngine().queryBindings(query, { sources: [store] })

  const byUri = new Map<string, SoftwareEntry>()
  for await (const binding of bindings) {
    const uri = binding.get('software')?.value
    if (!uri) continue
    let entry = byUri.get(uri)
    if (!entry) {
      entry = { uri, repositories: [] }
      byUri.set(uri, entry)
    }
    const repo = binding.get('repo')?.value
    if (repo && !entry.repositories.includes(repo)) {
      entry.repositories.push(repo)
    }
  }
  return [...byUri.values()]
}

function nTriples(subject: string, predicate: string, object: string): string {
  return `<${subject}> <${predicate}> <${object}> .`
}

/**
 * Build the software URI -> PackageData map, merging multiple repositories
 * per software (name from the first successful fetch, deps unioned).
 */
export function buildPackageMap(
  entries: SoftwareEntry[],
  repoResults: ReadonlyMap<string, FetchResultLike>,
): Map<string, PackageData> {
  const packageMap = new Map<string, PackageData>()
  for (const entry of entries) {
    for (const repo of entry.repositories) {
      const result = repoResults.get(repo)
      if (!result?.ok) continue
      const existing = packageMap.get(entry.uri)
      if (!existing) {
        packageMap.set(entry.uri, { name: result.name!, deps: [...result.deps!] })
      } else if (!existing.deps.includes(result.name!)) {
        for (const dep of result.deps!) {
          if (!existing.deps.includes(dep)) existing.deps.push(dep)
        }
      }
    }
  }
  return packageMap
}

/**
 * Compute new ex:hasDependencyOn statements between catalog software.
 * A statement <A> ex:hasDependencyOn <B> is emitted when a dependency name
 * of A's package metadata exactly matches B's package name. Statements
 * already present in the dataset are excluded. Self-dependencies are skipped.
 */
export function computeDependencyStatements(
  entries: SoftwareEntry[],
  packageMap: ReadonlyMap<string, PackageData>,
  existing: ReadonlySet<string> = new Set(),
): { statements: string[]; unmatched: Map<string, string[]> } {
  const nameToUris = new Map<string, string[]>()
  for (const [uri, pkg] of packageMap) {
    const uris = nameToUris.get(pkg.name) ?? []
    uris.push(uri)
    nameToUris.set(pkg.name, uris)
  }

  const seen = new Set<string>()
  const statements: string[] = []
  const unmatched = new Map<string, string[]>()

  for (const entry of entries) {
    const pkg = packageMap.get(entry.uri)
    if (!pkg) continue
    const misses: string[] = []
    for (const dep of pkg.deps) {
      const targets = nameToUris.get(dep)
      if (!targets) {
        if (!misses.includes(dep)) misses.push(dep)
        continue
      }
      for (const target of targets) {
        if (target === entry.uri) continue
        const triple = nTriples(entry.uri, HAS_DEPENDENCY_ON, target)
        if (existing.has(triple) || seen.has(triple)) continue
        seen.add(triple)
        statements.push(triple)
      }
    }
    if (misses.length > 0) unmatched.set(entry.uri, misses)
  }
  return { statements, unmatched }
}

/** Collect existing ex:hasDependencyOn statements (as N-Triples) from the store. */
export function existingDependencyStatements(store: Store): Set<string> {
  const existing = new Set<string>()
  for (const quad of store.getQuads(null, HAS_DEPENDENCY_ON, null, null)) {
    if (quad.subject.termType !== 'NamedNode' || quad.object.termType !== 'NamedNode') continue
    existing.add(nTriples(quad.subject.value, HAS_DEPENDENCY_ON, quad.object.value))
  }
  return existing
}

/**
 * Full analysis: parse the catalog TTL, enumerate software/repositories,
 * merge fetched package metadata, and compute the new dependency statements.
 */
export async function analyzeSoftwareDependencies(
  ttl: string,
  repoResults: ReadonlyMap<string, FetchResultLike>,
): Promise<AnalysisResult> {
  const store = await parseCatalogDataset(ttl)
  const entries = await enumerateSoftware(store)
  const packageMap = buildPackageMap(entries, repoResults)
  const existing = existingDependencyStatements(store)
  const { statements, unmatched } = computeDependencyStatements(entries, packageMap, existing)
  return { entries, packageMap, statements, unmatched }
}
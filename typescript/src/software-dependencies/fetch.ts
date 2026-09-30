// Repository -> package.json fetching (all HTTP).
// Resolves a repository URI to a raw package.json and collects its
// dependency names across all dependency sections.

export interface PackageData {
  name: string
  deps: string[]
}

export type FetchResult =
  | { ok: true; name: string; deps: string[] }
  | { ok: false; reason: string }

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

function collectDeps(json: Record<string, unknown>): string[] {
  const names = new Set<string>()
  for (const section of DEP_SECTIONS) {
    const value = json[section]
    if (value && typeof value === 'object') {
      for (const dep of Object.keys(value as Record<string, unknown>)) {
        names.add(dep)
      }
    }
  }
  return [...names]
}

/**
 * Turn a repository URI like https://github.com/owner/repo[/] into a raw
 * package.json URL. GitHub uses raw.githubusercontent.com with a HEAD ref
 * (follows the default branch). Other hosts get a best-effort gitea-style
 * raw URL and are skipped when that fails.
 */
export function rawPackageJsonUrl(repo: string): string {
  try {
    const url = new URL(repo)
    const host = url.hostname
    if (host === 'github.com' || host.endsWith('.github.com')) {
      const [owner, name] = url.pathname.split('/').filter(Boolean)
      if (!owner || !name) {
        throw new Error(`Unparseable GitHub repo: ${repo}`)
      }
      return `https://raw.githubusercontent.com/${owner}/${name}/HEAD/package.json`
    }
    return `${url.origin}/raw/HEAD/package.json`
  } catch (err) {
    throw new Error(`Unparseable repository URI: ${repo} (${err instanceof Error ? err.message : err})`)
  }
}

/** Fetch and parse package.json at the root of a repository. */
export async function fetchPackageJson(repo: string): Promise<FetchResult> {
  let url: string
  try {
    url = rawPackageJsonUrl(repo)
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    return { ok: false, reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status} for ${url}` }
  }

  let text: string
  try {
    text = await response.text()
    const json = JSON.parse(text) as Record<string, unknown>
    if (typeof json['name'] !== 'string' || json['name'].length === 0) {
      return { ok: false, reason: `package.json has no name at ${url}` }
    }
    return { ok: true, name: json['name'], deps: collectDeps(json) }
  } catch (err) {
    return { ok: false, reason: `invalid package.json at ${url}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Fetch package.json for many repositories with bounded concurrency. */
export async function fetchAllPackageJson(
  repos: string[],
  concurrency = 5,
): Promise<Map<string, FetchResult>> {
  const results = new Map<string, FetchResult>()
  let next = 0
  async function worker() {
    while (next < repos.length) {
      const repo = repos[next++]!
      results.set(repo, await fetchPackageJson(repo))
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, repos.length || 1) }, () => worker())
  await Promise.all(workers)
  return results
}
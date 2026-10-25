import { readFile } from 'node:fs/promises'
import type { SpecrefEntry } from './matching.ts'

export const DEFAULT_SPECREF_URL = 'https://api.specref.org/bibrefs'

/**
 * Load the merged Specref bibliography. `path` is intended for local test runs
 * and the checked-out Specref data; otherwise the public full dump is fetched.
 */
export async function loadSpecrefEntries(
  path?: string,
  url = DEFAULT_SPECREF_URL,
): Promise<{ entries: SpecrefEntry[]; source: string }> {
  let raw: unknown
  let source: string
  if (path) {
    source = path
    raw = JSON.parse(await readFile(path, 'utf8'))
  } else {
    source = url
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Specref ${url}: HTTP ${response.status} ${response.statusText}`,
      )
    }
    raw = await response.json()
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`unexpected Specref document in ${source}`)
  }

  const entries: SpecrefEntry[] = []
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Partial<SpecrefEntry>
    entries.push({ ...entry, id: entry.id ?? id } as SpecrefEntry)
  }
  return { entries, source }
}

// URL helpers shared by citation extraction and resolution. Matching uses the
// same normalization as the Specref linker so a rendered reference link and a
// catalog spec subject compare equal.

import { normalizeUrl } from '../specref/matching.ts'

const TR_HOST = 'w3.org'

/** Parse and drop the fragment; query strings are kept. */
export function cleanUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

/** True for any URL on the W3C TR path, including dated snapshots. */
export function isTrUrl(value: string): boolean {
  const clean = cleanUrl(value)
  if (!clean) return false
  const url = new URL(clean)
  return (
    url.hostname.toLowerCase().replace(/^www\./, '') === TR_HOST &&
    url.pathname.startsWith('/TR/')
  )
}

/** The normalized key used to match a TR URL against the catalog. */
export function trKey(value: string): string | undefined {
  const clean = cleanUrl(value)
  if (!clean || !isTrUrl(clean)) return undefined
  return normalizeUrl(clean)
}

/**
 * A dated snapshot URL such as /TR/2022/REC-did-core-20220719/ points at the
 * same series as /TR/did-core/. Derive the shortlink so citations to a dated
 * version still resolve to the catalog spec.
 */
export function shortlinkFromDatedTrUrl(value: string): string | undefined {
  const clean = cleanUrl(value)
  if (!clean || !isTrUrl(clean)) return undefined
  const url = new URL(clean)
  const match = url.pathname.match(
    /^\/TR\/(?:\d{4}\/)?[A-Z]+-(.+?)-\d{8}\/?$/,
  )
  if (!match?.[1]) return undefined
  return `https://www.w3.org/TR/${match[1]}/`
}

/** The shortname in a catalog subject such as https://www.w3.org/TR/did-core/. */
export function shortnameFromSpecUri(uri: string): string | undefined {
  const clean = cleanUrl(uri)
  if (!clean || !isTrUrl(clean)) return undefined
  const url = new URL(clean)
  const match = url.pathname.match(/^\/TR\/([^/]+)\/?$/)
  return match?.[1]
}

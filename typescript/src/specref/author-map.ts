import { normalizePersonName } from './names.ts'

// Manual author resolutions to fill in after reviewing the author report.
//
// Keys are either:
//   "<specref-id>|<normalized author name>"  (preferred; spec-specific)
//   "<normalized author name>"                (global fallback)
// Values are person subjects, normally urn:w3c:person:<numeric id>.
//
// These four name resolutions were verified against the W3C API editor links.
// Pierre-Antoine Champin is resolved globally; 42931 is also canonicalized to
// 129656 in person-ids.ts.
const AUTHOR_OVERRIDES = new Map<string, string>([
  ['pierre-antoine champin', 'urn:w3c:person:129656'],
  // Christopher Webber is the former name of Christine Lemmer-Webber, who is
  // the editor of ActivityPub.
  ['activitypub|christopher webber', 'urn:w3c:person:57007'],
  ['did-use-cases|ryan grant', 'urn:w3c:person:101398'],
  ['wot-profile|tomoaki mizushima', 'urn:w3c:person:98915'],
  ['wot-usecases|tomoaki mizushima', 'urn:w3c:person:98915'],
])

/** Return a manually verified person for a Specref author, if one exists. */
export function resolveAuthorOverride(
  specrefId: string,
  name: string,
): string | undefined {
  const normalized = normalizePersonName(name)
  return (
    AUTHOR_OVERRIDES.get(`${specrefId}|${normalized}`) ??
    AUTHOR_OVERRIDES.get(normalized)
  )
}

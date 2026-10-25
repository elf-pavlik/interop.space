// Explicit Specref resolutions for the three W3C API specification pairs that
// share one public shortlink. Specref has a single canonical entry for that
// document, so every API record in the pair is pointed at the same Specref ID.
//
// Key: W3C API self URL (ex:w3cApiUrl)
// Value: canonical Specref ID
const KNOWN_SPECREF_EXCEPTIONS = new Map<string, string>([
  // UI Events: the current series and the historical uievents-old both
  // represent https://www.w3.org/TR/uievents/. Specref keeps "uievents".
  ['https://api.w3.org/specifications/uievents', 'uievents'],
  ['https://api.w3.org/specifications/uievents-old', 'uievents'],

  // PNG: png-1 and png-2 both use https://www.w3.org/TR/PNG/. Specref's
  // canonical entry for that URL is PNG-1 (its title is the Second Edition).
  ['https://api.w3.org/specifications/png-1', 'PNG-1'],
  ['https://api.w3.org/specifications/png-2', 'PNG-1'],

  // Performance Timeline: the current series and performance-timeline-1
  // both use https://www.w3.org/TR/performance-timeline/. Specref keeps
  // "performance-timeline".
  [
    'https://api.w3.org/specifications/performance-timeline',
    'performance-timeline',
  ],
  [
    'https://api.w3.org/specifications/performance-timeline-1',
    'performance-timeline',
  ],
])

/**
 * Return the explicitly chosen Specref ID for a known W3C API exception.
 * A normal shortlink match still wins when no exception applies.
 */
export function resolveKnownSpecrefException(
  apiUrl: string | undefined,
): string | undefined {
  return apiUrl ? KNOWN_SPECREF_EXCEPTIONS.get(apiUrl) : undefined
}

/** Normalize a person/author name for exact matching. */
export function normalizePersonName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

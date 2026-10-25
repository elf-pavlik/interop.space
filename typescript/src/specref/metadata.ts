// Specref metadata as RDF. The W3C API spec shortlink is the subject, so these
// predicates sit alongside the ex: properties from the W3C API instead of
// overwriting them.

import { DataFactory } from 'n3'
import type { Quad, Store } from 'n3'
import { EX } from '../software-dependencies/analysis.ts'
import type { SpecrefEntry } from './matching.ts'

const { literal, namedNode, quad } = DataFactory

const DCTERMS = 'http://purl.org/dc/terms/'
const BIBO = 'http://purl.org/ontology/bibo/'
const SDO = 'https://schema.org/'
const SPECREF = 'https://w3id.org/specref/'
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean'

export const SPECREF_PREDICATES = {
  id: `${EX}specrefId`,
  title: `${DCTERMS}title`,
  authors: `${DCTERMS}creator`,
  etAl: `${SPECREF}etAl`,
  href: `${BIBO}uri`,
  date: `${DCTERMS}date`,
  rawDate: `${SPECREF}rawDate`,
  status: `${BIBO}status`,
  publisher: `${DCTERMS}publisher`,
  obsoletes: `${BIBO}obsoletes`,
  obsoletedBy: `${BIBO}obsoletedBy`,
  edDraft: `${SPECREF}edDraft`,
  isbn: `${BIBO}isbn`,
  pages: `${BIBO}pages`,
  repository: `${SDO}codeRepository`,
} as const

export const SPECREF_METADATA_PREDICATES: string[] = Object.values(
  SPECREF_PREDICATES,
)

/**
 * RDF for one canonical Specref entry. Versions, aliases and deliveredBy are
 * deliberately omitted for this iteration: W3C API owns group membership and
 * version history is still out of scope.
 */
export function buildSpecrefQuads(
  subject: string,
  entry: SpecrefEntry,
  authorLinks?: ReadonlyMap<string, string>,
): Quad[] {
  const node = namedNode(subject)
  const quads: Quad[] = [
    quad(node, namedNode(SPECREF_PREDICATES.id), literal(entry.id)),
  ]

  if (entry.title) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.title), literal(entry.title)),
    )
  }
  for (const author of entry.authors ?? []) {
    const person = authorLinks?.get(author)
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.authors),
        person ? namedNode(person) : literal(author),
      ),
    )
  }
  if (typeof entry.etAl === 'boolean') {
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.etAl),
        literal(String(entry.etAl), namedNode(XSD_BOOLEAN)),
      ),
    )
  }
  if (entry.href) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.href), namedNode(entry.href)),
    )
  }
  if (entry.date) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.date), literal(entry.date)),
    )
  }
  if (entry.rawDate) {
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.rawDate),
        literal(entry.rawDate),
      ),
    )
  }
  if (entry.status) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.status), literal(entry.status)),
    )
  }
  if (entry.publisher) {
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.publisher),
        literal(entry.publisher),
      ),
    )
  }
  for (const id of entry.obsoletes ?? []) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.obsoletes), literal(id)),
    )
  }
  for (const id of entry.obsoletedBy ?? []) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.obsoletedBy), literal(id)),
    )
  }
  if (entry.edDraft) {
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.edDraft),
        namedNode(entry.edDraft),
      ),
    )
  }
  if (entry.isbn) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.isbn), literal(entry.isbn)),
    )
  }
  if (entry.pages) {
    quads.push(
      quad(node, namedNode(SPECREF_PREDICATES.pages), literal(entry.pages)),
    )
  }
  if (entry.repository) {
    quads.push(
      quad(
        node,
        namedNode(SPECREF_PREDICATES.repository),
        namedNode(entry.repository),
      ),
    )
  }

  return quads
}

/** SPARQL Update that clears Specref metadata from the given spec subjects. */
export function specrefMetadataDeleteUpdate(subjects: string[]): string {
  if (subjects.length === 0) return ''
  const subjectValues = subjects.map((subject) => `<${subject}>`).join(' ')
  const predicateValues = SPECREF_METADATA_PREDICATES.map(
    (predicate) => `<${predicate}>`,
  ).join(' ')
  return `DELETE { ?s ?p ?o } WHERE {
    VALUES ?s { ${subjectValues} }
    VALUES ?p { ${predicateValues} }
    ?s ?p ?o .
  }`
}

/** Remove previously imported Specref metadata from the given spec subjects. */
export function removeSpecrefMetadata(
  store: Store,
  subjects: string[],
): void {
  for (const subject of subjects) {
    for (const predicate of SPECREF_METADATA_PREDICATES) {
      store.removeQuads(
        store.getQuads(
          namedNode(subject),
          namedNode(predicate),
          null,
          null,
        ),
      )
    }
  }
}

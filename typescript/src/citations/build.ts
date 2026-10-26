// RDF for the citation graph. Citations are plain edges on the catalog spec
// node; no version nodes, edge nodes or provenance predicates are added yet.

import { DataFactory } from 'n3'
import type { Quad } from 'n3'
import { EX } from '../software-dependencies/analysis.ts'
import type { Citation } from './types.ts'

const { namedNode, quad } = DataFactory

export const NORMATIVE_REF = `${EX}normativeRef`
export const INFORMATIVE_REF = `${EX}informativeRef`
export const CITATION_PREDICATES = [NORMATIVE_REF, INFORMATIVE_REF]

export function buildCitationQuads(citations: Citation[]): Quad[] {
  return citations.map((citation) =>
    quad(
      namedNode(citation.source),
      namedNode(
        citation.nature === 'normative' ? NORMATIVE_REF : INFORMATIVE_REF,
      ),
      namedNode(citation.target),
    ),
  )
}

/**
 * Clear the citation edges of the specs that were extracted successfully.
 * Specs whose fetch or parse failed are not listed, so their previous edges
 * survive the run.
 */
export function citationDeleteUpdate(subjects: string[]): string {
  if (subjects.length === 0) return ''
  const values = subjects.map((subject) => `<${subject}>`).join(' ')
  const predicates = CITATION_PREDICATES.map(
    (predicate) => `<${predicate}>`,
  ).join(', ')
  return `DELETE { ?s ?p ?o } WHERE { VALUES ?s { ${values} } ?s ?p ?o . FILTER(?p IN (${predicates})) }`
}

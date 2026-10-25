// Link W3C API specifications in a catalog dump to canonical Specref
// bibliography entries and add the selected Specref metadata.
//
// Usage (from typescript/):
//   bun run src/specref/run.ts \
//     --input /tmp/w3c-api-fresh.nq \
//     --output /tmp/w3c-api-linked.nq \
//     --report /tmp/specref-report.json \
//     --specref /tmp/specref-merged.json
//
// Without --specref, the full Specref dump is fetched from
// https://api.specref.org/bibrefs (or SPECREF_URL).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DataFactory, Writer } from 'n3'
import type { Store, Term } from 'n3'
import { RDF_TYPE } from '../software-dependencies/analysis.ts'
import {
  EDITOR_DRAFT,
  LANDING_PAGE,
  NAME,
  PERSON_TYPE,
  SHORTNAME,
  SPECIFICATION,
  SPECIFICATION_TYPE,
  W3C_API_URL,
  parseDataset,
} from '../w3c-api/analysis.ts'
import { buildPersonNameIndex, type PersonRef } from './authors.ts'
import {
  type AuthorReport,
  type ResolutionKey,
  linkSpecifications,
} from './link.ts'
import { type SpecrefEntry } from './matching.ts'
import { removeSpecrefMetadata } from './metadata.ts'
import { DEFAULT_SPECREF_URL, loadSpecrefEntries } from './source.ts'

const { namedNode } = DataFactory

interface GroupContext {
  uri: string
  name?: string
  shortname?: string
}

interface SpecContext {
  uri: string
  shortlink?: string
  apiUrl?: string
  shortname?: string
  title?: string
  editorDraft?: string
  groups: GroupContext[]
}

interface SpecrefCandidate {
  id: string
  title?: string
  href?: string
  edDraft?: string
  status?: string
  publisher?: string
  deliveredBy?: SpecrefEntry['deliveredBy']
}

interface MatchReport {
  key: ResolutionKey
  specrefId: string
  spec: SpecContext
}

interface CollisionReport {
  key: ResolutionKey
  spec: SpecContext
  candidates: SpecrefCandidate[]
}

interface Report {
  generatedAt: string
  input: string
  output: string
  specrefSource: string
  counts: {
    specrefEntries: number
    specrefCanonical: number
    specs: number
    matched: number
    collisions: number
    unmatched: number
    byKey: Record<ResolutionKey, number>
  }
  matches: MatchReport[]
  collisions: CollisionReport[]
  unmatched: SpecContext[]
  authors: {
    counts: Record<AuthorReport<SpecContext>['status'], number>
    problems: AuthorReport<SpecContext>[]
  }
}

function objectValue(
  store: Store,
  subject: Term,
  predicate: string,
): string | undefined {
  return store.getObjects(subject, namedNode(predicate), null)[0]?.value
}

function specContext(store: Store, subject: Term): SpecContext {
  const groups = (
    store.getSubjects(namedNode(SPECIFICATION), subject, null) as Term[]
  ).map((group) => ({
    uri: group.value,
    name: objectValue(store, group, NAME),
    shortname: objectValue(store, group, SHORTNAME),
  }))
  groups.sort((a, b) => a.uri.localeCompare(b.uri))
  return {
    uri: subject.value,
    shortlink: objectValue(store, subject, LANDING_PAGE) ?? subject.value,
    apiUrl: objectValue(store, subject, W3C_API_URL),
    shortname: objectValue(store, subject, SHORTNAME),
    title: objectValue(store, subject, NAME),
    editorDraft: objectValue(store, subject, EDITOR_DRAFT),
    groups,
  }
}

function personRefs(store: Store): PersonRef[] {
  const subjects = store.getSubjects(
    namedNode(RDF_TYPE),
    namedNode(PERSON_TYPE),
    null,
  ) as Term[]
  const people: PersonRef[] = []
  for (const subject of subjects) {
    const name = objectValue(store, subject, NAME)
    if (name) people.push({ uri: subject.value, name })
  }
  return people
}

function candidate(entry: SpecrefEntry): SpecrefCandidate {
  return {
    id: entry.id,
    title: entry.title,
    href: entry.href,
    edDraft: entry.edDraft,
    status: entry.status,
    publisher: entry.publisher,
    deliveredBy: entry.deliveredBy,
  }
}

function usage(): string {
  return `Usage: bun run src/specref/run.ts [options]

Options:
  -i, --input <file>       N-Quads dump to read (default: DUMP_PATH or ui/public/dump.nq)
  -o, --output <file>       enriched N-Quads output (default: <input>.linked.nq)
  -r, --report <file>       JSON report (default: <input>.specref-report.json)
      --specref <file>      local Specref JSON dump (default: SPECREF_PATH)
      --specref-url <url>   Specref dump URL (default: SPECREF_URL or api.specref.org)
  -h, --help                show this help
`
}

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      report: { type: 'string', short: 'r' },
      specref: { type: 'string' },
      'specref-url': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(usage())
    return
  }

  const input =
    values.input ??
    process.env.DUMP_PATH ??
    fileURLToPath(new URL('../../../ui/public/dump.nq', import.meta.url))
  const base = input.replace(/\.nq$/i, '')
  const output = values.output ?? `${base}.linked.nq`
  const reportPath = values.report ?? `${base}.specref-report.json`
  const specrefPath = values.specref ?? process.env.SPECREF_PATH
  const specrefUrl =
    values['specref-url'] ??
    process.env.SPECREF_URL ??
    DEFAULT_SPECREF_URL

  const store = await parseDataset(await readFile(input, 'utf8'))
  const { entries, source } = await loadSpecrefEntries(
    specrefPath,
    specrefUrl,
  )

  const specSubjects = store.getSubjects(
    namedNode(RDF_TYPE),
    namedNode(SPECIFICATION_TYPE),
    null,
  ) as Term[]
  const specs = specSubjects
    .map((subject) => specContext(store, subject))
    .sort((a, b) => a.uri.localeCompare(b.uri))

  // Re-running the linker must not keep stale Specref triples from an earlier
  // input file.
  removeSpecrefMetadata(store, specs.map((spec) => spec.uri))

  const authorIndex = buildPersonNameIndex(personRefs(store))
  const linked = linkSpecifications(specs, entries, { authorIndex })
  for (const specQuad of linked.quads) store.addQuad(specQuad)

  const matches: MatchReport[] = linked.matches.map((match) => ({
    key: match.key,
    specrefId: match.entry.id,
    spec: match.target,
  }))
  const collisions: CollisionReport[] = linked.collisions.map((collision) => ({
    key: collision.key,
    spec: collision.target,
    candidates: collision.candidates.map(candidate),
  }))
  const unmatched = linked.unmatched
  const byKey = linked.byKey
  const authorProblems = linked.authors.filter(
    (author) => author.status === 'unmatched' || author.status === 'ambiguous',
  )
  const authorCounts: Record<AuthorReport<SpecContext>['status'], number> = {
    matched: linked.authors.filter((author) => author.status === 'matched').length,
    override: linked.authors.filter((author) => author.status === 'override').length,
    unmatched: linked.authors.filter((author) => author.status === 'unmatched').length,
    ambiguous: linked.authors.filter((author) => author.status === 'ambiguous').length,
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    input,
    output,
    specrefSource: source,
    counts: {
      specrefEntries: entries.length,
      specrefCanonical: entries.filter((entry) => !entry.aliasOf && !entry.versionOf).length,
      specs: specs.length,
      matched: matches.length,
      collisions: collisions.length,
      unmatched: unmatched.length,
      byKey,
    },
    matches,
    collisions,
    unmatched,
    authors: {
      counts: authorCounts,
      problems: authorProblems,
    },
  }

  await mkdir(dirname(output), { recursive: true })
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(
    output,
    new Writer().quadsToString(store.getQuads(null, null, null, null)),
    'utf8',
  )
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`Specref: ${source}`)
  console.log(
    `  entries: ${report.counts.specrefEntries}, canonical: ${report.counts.specrefCanonical}`,
  )
  console.log(`W3C API specs: ${specs.length}`)
  console.log(
    `  matched: ${matches.length} (${Object.entries(byKey)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key} ${count}`)
      .join(', ') || 'none'})`,
  )
  console.log(`  collisions: ${collisions.length}`)
  console.log(`  unmatched: ${unmatched.length}`)
  console.log(
    `  authors: ${authorCounts.matched} matched, ${authorCounts.override} override, ${authorCounts.unmatched} unmatched, ${authorCounts.ambiguous} ambiguous`,
  )

  for (const collision of collisions) {
    console.log(`\nCOLLISION [${collision.key}] ${collision.spec.uri}`)
    console.log(
      `  W3C: ${collision.spec.title ?? '(no title)'} | ${collision.spec.apiUrl ?? '(no API URL)'}`,
    )
    for (const candidate of collision.candidates) {
      console.log(
        `  - ${candidate.id} | ${candidate.title ?? '(no title)'} | ${candidate.href ?? '(no href)'}`,
      )
    }
  }

  for (const spec of unmatched) {
    console.log(
      `\nUNMATCHED ${spec.uri} | ${spec.title ?? '(no title)'} | ${spec.apiUrl ?? '(no API URL)'}`,
    )
  }

  for (const author of authorProblems) {
    console.log(
      `\nAUTHOR ${author.status.toUpperCase()} ${author.specrefId} | ${author.name} | ${author.target.uri}`,
    )
    if (author.candidates?.length) {
      console.log(`  candidates: ${author.candidates.join(', ')}`)
    }
  }

  console.log(`\nwrote ${output}`)
  console.log(`wrote ${reportPath}`)
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

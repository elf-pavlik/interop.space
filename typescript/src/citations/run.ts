// Standalone citation extractor. Reads the dump, fetches the latest version of
// every catalog spec, prints the new citation quads to stdout, and writes the
// run report next to the dump.
//
// Usage:
//   bun run src/citations/run.ts                    # ui/public/dump.nq
//   bun run src/citations/run.ts <dump.nq>
//   DUMP_PATH=<dump.nq> bun run src/citations/run.ts

import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { readDataset, serializeQuads } from '../w3c-api/analysis.ts'
import { buildCitationQuads } from './build.ts'
import { collectCitations } from './collect.ts'
import { summarizeCitations, writeCitationReport } from './report.ts'

const DEFAULT_DUMP_PATH = new URL(
  '../../../ui/public/dump.nq',
  import.meta.url,
).pathname

const DEFAULT_REPORT_PATH = new URL(
  '../../../ui/public/citations-report.json',
  import.meta.url,
).pathname

export async function main(argv: string[]): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true })
  const dumpPath =
    positionals[0] ?? process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH
  const reportPath =
    process.env.CITATIONS_REPORT_PATH ?? DEFAULT_REPORT_PATH

  const { specifications } = await readDataset(await readFile(dumpPath, 'utf8'))
  const { citations, report } = await collectCitations(specifications)
  const quads = buildCitationQuads(citations)

  for (const line of serializeQuads(quads).trimEnd().split('\n')) {
    if (line) console.log(line)
  }
  await writeCitationReport(reportPath, report)

  console.error(`dump: ${dumpPath}`)
  console.error(`report: ${reportPath}`)
  console.error(summarizeCitations(report))
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

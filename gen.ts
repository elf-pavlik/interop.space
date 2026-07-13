// Generates types for every consumer from the shared JSON Schemas in ./schema.
// Single entry point for all languages + the UI. Run with:
//   bun gen.ts            regenerate every target
//   bun gen.ts ui dotnet  regenerate only the named targets
// Uses quicktype via npx (no local dependencies; C# targets in-box System.Text.Json).
import { Glob } from 'bun'
import { dirname, join, basename, relative } from 'node:path'
import { mkdir } from 'node:fs/promises'

const ROOT = new URL('./', import.meta.url).pathname
const SCHEMA_ROOT = join(ROOT, 'schema')
const BANNER = '// Code generated from JSON Schema. DO NOT EDIT.\n\n'

type Target =
  | { name: string; lang: 'ts'; out: string }
  | { name: string; lang: 'cs'; out: string; rootNs: string }

const TARGETS: Target[] = [
  { name: 'typescript', lang: 'ts', out: 'typescript/src/gen' },
  { name: 'ui', lang: 'ts', out: 'ui/src/gen' },
  { name: 'dotnet', lang: 'cs', out: 'dotnet/Gen/gen', rootNs: 'Interop' },
]

const pascal = (s: string) =>
  s.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase())

const run = async (cmd: string[], outFile?: string) => {
  const proc = Bun.spawn(cmd, { stdout: outFile ? 'inherit' : 'pipe', stderr: 'inherit' })
  const text = outFile ? '' : await new Response(proc.stdout).text()
  if ((await proc.exited) !== 0) process.exit(1)
  return text
}

const wanted = Bun.argv.slice(2)
const targets = wanted.length ? TARGETS.filter((t) => wanted.includes(t.name)) : TARGETS
if (!targets.length) {
  console.error(`no matching targets in [${wanted}]; known: ${TARGETS.map((t) => t.name).join(', ')}`)
  process.exit(1)
}

for (const t of targets) {
  console.log(`# ${t.name} (${t.lang}) -> ${t.out}`)
  for await (const file of new Glob('**/*.schema.json').scan(SCHEMA_ROOT)) {
    const dir = dirname(file) // "." for a top-level schema
    const name = pascal(basename(file, '.schema.json'))
    const src = join(SCHEMA_ROOT, file)

    if (t.lang === 'ts') {
      const out = join(ROOT, t.out, file.replace(/\.schema\.json$/, '.ts'))
      await mkdir(dirname(out), { recursive: true })
      const ts = await run([
        'npx', '-y', 'quicktype@23',
        '--src-lang', 'schema', '--lang', 'ts',
        '--top-level', name, '--just-types', src,
      ])
      await Bun.write(out, BANNER + ts)
      console.log(`  ${file} -> ${relative(ROOT, out)}`)
    } else {
      const ns = dir === '.' ? t.rootNs : [t.rootNs, ...dir.split('/').map(pascal)].join('.')
      const out = join(ROOT, t.out, dir, `${name}.g.cs`)
      await mkdir(dirname(out), { recursive: true })
      await run([
        'npx', '-y', 'quicktype@23',
        '--src-lang', 'schema', '--lang', 'cs', '--framework', 'SystemTextJson',
        '--namespace', ns, '--top-level', name, '--features', 'just-types', '-o', out, src,
      ], out)
      console.log(`  ${file} -> ${relative(ROOT, out)} (namespace ${ns})`)
    }
  }
}

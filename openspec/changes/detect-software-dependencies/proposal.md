# Proposal

## Why

The Solid efforts catalog (`solid-efforts-core` `catalog-data.ttl`) lists 163 `ex:Software` records, yet only 11 carry `ex:hasDependencyOn` statements (hand-written, all for `sai.js.org/*`). Most entries have an `ex:repository` pointing at the software's repository, so the dependency graph can be derived automatically from the repositories' `package.json` files instead of being maintained by hand. This keeps catalog relations grounded in actual npm dependencies and lets them be refreshed on a schedule.

## What Changes

- New TypeScript module under `typescript/src/` (Bun runtime, same as existing Temporal worker) that:
  - Parses `catalog-data.ttl` with **N3** into an in-memory dataset.
  - Queries it with **@comunica/query-sparql-rdfjs** to find every `ex:Software` record and its `ex:repository` values.
  - Fetches `package.json` from each repository root. For GitHub repos, uses raw.githubusercontent.com with the `HEAD` ref; repos with no `package.json` at root are skipped and reported. Non-GitHub hosts (`git.dokie.li`, `lists.w3.org`) are attempted best-effort.
  - Builds a map: software URI → parsed package.json (`name` plus all dependency sections).
  - Computes new `ex:hasDependencyOn` triples: software A depends on software B when a dependency name in A's package.json matches B's package.json `name`. All dependency sections count: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.
  - Merges new triples into the catalog dataset, preserving all existing statements (existing `hasDependencyOn` statements are kept; new ones are deduplicated).
- **Phase 1 — standalone script** (no Temporal): parses a local `catalog-data.ttl`, prints only the **delta** (the newly computed `hasDependencyOn` statements) plus a summary of skipped software.
- **Phase 2 — Temporal workflow** (once Phase 1 works): workflow + activities that (a) seed the catalog dataset into the running Oxigraph SPARQL endpoint via the existing `seedData`/`DATASET_PATH` flow, (b) compute the dependency statements, (c) apply them with a SPARQL UPDATE through `fetch-sparql-endpoint`, so the existing Dagger `export-dump`/UI dump flow reflects the enriched dataset.

## Capabilities

### New Capabilities
- `software-dependencies`: deriving `ex:hasDependencyOn` relations between catalog software entries from repository `package.json` files — both as a repeatable standalone analysis (delta output) and as a Temporal workflow that persists the enriched dataset to the SPARQL endpoint.

### Modified Capabilities
- None (the project has no existing specs yet).

## Impact

- `typescript/package.json`: new dependencies `n3` and `@comunica/query-sparql-rdfjs` (must work under Bun).
- New module `typescript/src/software-dependencies/` with the analysis logic, repository/package.json fetching, and (phase 2) workflow + activities.
- `typescript/src/workflows.ts` / `typescript/src/worker.ts`: registration of the new workflow and its activities (new task queue or reuse of the `greeting` queue pattern).
- `.dagger/src/index.ts`: optionally schedule the workflow alongside the existing worker wiring (phase 2 verification runs it from the client).
- Upstream data: the computed delta can be folded manually into `solid-efforts-core` `catalog-data.ttl`; the SPARQL endpoint is enriched at runtime.
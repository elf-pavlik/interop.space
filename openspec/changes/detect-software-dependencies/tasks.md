# Tasks

## 1. Setup and spike

- [x] 1.1 Add `n3` and `@comunica/query-sparql-rdfjs` to `typescript/package.json` (`bun add`) and verify `bun run typecheck` passes and a minimal N3 → Comunica `QueryEngine` query over a small TTL string runs under Bun
- [x] 1.2 Create `typescript/src/software-dependencies/` skeleton with `analysis.ts`, `fetch.ts`, `run.ts`, `activities.ts`, `workflows.ts` placeholder modules and verify the files exist and typecheck

## 2. Phase 1 — standalone analysis script

- [x] 2.1 Implement TTL parsing + SPARQL enumeration in `analysis.ts`: parse a TTL document with `N3.Parser` into an `N3.Store`, query with `@comunica/query-sparql-rdfjs` for `?s a ex:Software` plus all `ex:repository` values, and verify against a downloaded `catalog-data.ttl` that it returns 163 software resources with 76 having repositories (run as a quick one-off assertion in the script)
- [x] 2.2 Implement `fetch.ts` `fetchPackageJson` for a repo URI: GitHub URLs map to `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/package.json`; non-GitHub hosts attempt `{host}/raw/HEAD/package.json`; 404/non-200/network errors return a skipped result. Verify with `https://github.com/renyuneyun/PermiX` (parse succeeds, `name` = `solid-permission-viewer`) and `https://github.com/solid/notifications` (skipped)
- [x] 2.3 Implement the dependency computation in `analysis.ts`: build `Map<softwareUri, { name, deps }>` merging multiple repositories per software, then emit `<A> ex:hasDependencyOn <B>` for every dependency name of A (across `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) that exactly matches a mapped package name, deduplicated. Verify with a small fixture TTL containing two software entries where one declares the other's package name as a dependency
- [x] 2.4 Implement `run.ts` CLI: accept a TTL path argument (or a `--url` for the catalog-data.ttl raw URL), run the analysis, print only the delta statements as N-Triples to stdout and a summary (mapped/skipped counts, unmatched dependency names) to stderr. Verify by running against the live catalog and confirming a non-empty delta plus a sensible summary, with no duplicate of the 11 pre-existing `hasDependencyOn` statements
- [x] 2.5 Spot-check delta correctness: verify a known relation (e.g. a software whose repo declares `@inrupt/solid-client`) appears in the delta and that no statement references an unmapped software URI; record findings for phase 2

## 3. Phase 2 — Temporal workflow and SPARQL persistence

- [x] 3.1 Implement activities in `activities.ts` reusing the analysis/fetch modules: `parseCatalog` (reads `DATASET_PATH` or downloads the catalog URL, returns software/repo list), `fetchPackageJson` (bounded concurrency, retries), `applyDependencyUpdate` (SPARQL UPDATE `INSERT DATA` of the delta via `fetch-sparql-endpoint` using `SPARQL_ENDPOINT`). Verify the module typechecks and `applyDependencyUpdate` succeeds against a running endpoint
- [x] 3.2 Implement `catalogDependencyWorkflow` in `workflows.ts` using `proxyActivities` with a `startToCloseTimeout`, orchestrating parse → fetch → compute (pure, in-workflow) → seed → apply, and verify it typechecks and registers correctly under Temporal 1.18 conventions
- [x] 3.3 Register the `catalog` task queue alongside `greeting` in `src/worker.ts` importing the new workflow and activities, and verify `bun run src/worker.ts` starts and the workflow appears in the Temporal UI/worker logs
- [x] 3.4 End-to-end: invoke `catalogDependencyWorkflow` from `src/client.ts` against the Dagger environment (`devbox run up`), then verify a SPARQL query for `ex:hasDependencyOn` on the endpoint returns the newly applied statements and `devbox run dump` output (`ui/public/dump.nq`) contains the enriched dataset
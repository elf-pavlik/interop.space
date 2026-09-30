# Design

## Context

The existing stack: a `typescript/` package (Bun) hosting Temporal 1.18 workers (`src/worker.ts` registers task queue `greeting` with `src/workflows.ts`), activities that talk to an Oxigraph SPARQL endpoint via `fetch-sparql-endpoint` and env vars `SPARQL_ENDPOINT`/`DATASET_PATH` (`src/activities.ts`), and a Dagger module (`.dagger/src/index.ts`) wiring temporal + postgres + oxigraph + workers + a dump flow (`devbox run dump` → `ui/public/dump.nq`). The catalog dataset (`catalog-data.ttl`, solid-efforts-core) has 163 `ex:Software` records; 76 carry `ex:repository` (98 distinct repos, 96 on GitHub); a handful of `ex:hasDependencyOn` statements already exist and must be preserved.

The `ex:` prefix in the catalog is `http://example.org#`. Repo root `package.json` fetching is verified working via `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/package.json`.

See proposal.md - Why for motivation, and the `software-dependencies` spec for the behavioral contract this design implements.

## Goals / Non-Goals

**Goals:**
- One shared analysis module usable both by a standalone script (phase 1) and by Temporal activities (phase 2).
- All dependency sections (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) considered; exact package-name matching; dedup of statements.
- Phase 1 prints only the delta statements; phase 2 persists the enriched dataset to the SPARQL endpoint so the existing dump flow reflects it.

**Non-Goals:**
- Monorepo sub-package discovery (only repo-root `package.json` per the request).
- Non-npm dependency ecosystems (no lockfile parsing, no non-JS package manifests).
- Committing the delta upstream into `solid-efforts-core` (the delta is produced as a file for manual folding).
- Sub-second cadence or incremental re-runs (run-on-demand / scheduled full re-analysis).
- Building a permanent queue/cron infra (reuses existing worker wiring).

## Decisions

### D1: One pure module + thin adapters (script and Temporal)
`typescript/src/software-dependencies/` contains:
- `analysis.ts` — pure data flow: parse TTL with `N3.Parser` into an `N3.Store`, query with `@comunica/query-sparql-rdfjs` for `?s a ex:Software ; ex:repository ?repo`, then compute the delta from a `Map<softwareUri, PackageMeta>`.
- `fetch.ts` — repo URI → `package.json` text/object (all HTTP).
- `run.ts` — standalone CLI: reads a local TTL path (default: download from the known raw URL), runs analysis, prints delta (N-Triples) to stdout, summary to stderr.
- `activities.ts` + `workflows.ts` — phase 2 Temporal facade over the same analysis/fetch code.

Rationale: the pure logic runs identically in both phases, so phase 2 is a thin wrapper; determinism-sensitive Temporal workflows never do HTTP directly (fetch stays in activities).
Alternative considered: writing the standalone script as throwaway — rejected because phase 2 was requested and duplicate logic would drift.

### D2: N3 + @comunica/query-sparql-rdfjs (RDF/JS source)
Parse via `N3.Parser` → `N3.Store`, then create a Comunica `QueryEngine` with the RDFJS query source `new QueryEngine().queryBindings(query, { sources: [store] })`. One SPARQL query returns software URI + repository URIs; a second pass does the dependency-name lookups in the in-memory map (no SPARQL needed per package).
Rationale: the user specified these libraries; Comunica gives SPARQL semantics over an in-memory RDFJS store, which stays deterministic and Bun-friendly (both are pure ESM JS).
Risk noted: the project has not yet depended on either library under Bun — mitigated by a spike task before the main build.

### D3: GitHub raw fetch with `HEAD` ref; others best-effort
GitHub repo URLs (`https://github.com/<owner>/<repo>[/]`) → `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/package.json`. The `HEAD` ref follows the default branch (verified 200/404). Non-GitHub hosts: attempt `{host}/raw/HEAD/package.json` (gitea-style) once, else skip. 404 / non-200 / network errors → skip, record in summary, never abort. Software with several repositories: fetch each and merge names/deps.
Alternative considered: resolving the default branch via the GitHub API — rejected: adds auth/rate-limit surface; `HEAD` avoids it.

### D4: Name-based matching, all dep sections, dedup
Matching is exact string equality against `package.json` `name` (scoped names like `@inrupt/solid-client` match verbatim). A statement `<A> ex:hasDependencyOn <B>` is emitted if any dependency name of A equals the package name of B, where both A and B are software URIs in the map. Union over all dependency sections and all of A's repositories; duplicates collapse. Software with no mapped package never appears as either side. Existing statements in the dataset are preserved verbatim.

### D5: Phase 2 Temporal wiring mirrors the existing pattern
- New task queue `catalog` registered in `src/worker.ts` alongside `greeting`, importing `software-dependencies/workflows.ts` and its activities (same `NativeConnection`/`connectWithRetry` pattern).
- Workflow `catalogDependencyWorkflow`: activity `parseCatalog` (reads `DATASET_PATH`, returns software/repo list) → activity `fetchPackageJson` (per repo, limited concurrency) → workflow computes statements via the shared pure function → activity `seedData` (existing) → activity `applyDependencyUpdate` (SPARQL UPDATE `INSERT DATA` of the delta via `fetch-sparql-endpoint`).
- Run from `src/client.ts` (mirrors `FediverseWorkflow` invocation) or a dedicated client; the Dagger `export-dump` flow then reflects the enriched dataset.

Rationale: reuses proven patterns (proxyActivities with `startToCloseTimeout`, env-based endpoint config, per-protocol folder layout used by `protocols/fediverse`).

## Risks / Trade-offs

- Bun compatibility of `@comunica/query-sparql-rdfjs`/`n3` → [R1] spike task first; both are ESM-only pure JS with no native deps, high expectation of compatibility; fall back to pinning a known-good version.
- Transient fetch failures/rate limits on raw.githubusercontent.com (~100 URLs) → [R2] bounded concurrency (e.g. 5), small delay, failures recorded in summary and retried on next run; workflow activity uses `retry` with backoff on the Temporal side.
- Monorepo roots that declare few/no deps (workspaces) produce sparse maps → [R3] accepted limitation per request (root only); noted in summary output.
- Name collisions between catalog entries and different external packages with the same name → [R4] matching is by package name; a catalog entry with that name wins by design; summary lists total matched/unmatched counts for review.
- Re-running seeds the catalog twice into the endpoint (idempotency of `seedData`) → [R5] SPARQL default-graph triple insert is idempotent at triple level; no action needed beyond dedup already in D4.

## Migration Plan

1. Phase 1 lands as `run.ts` + shared modules and is verified against the live catalog: delta printed locally, spot-checked against known `sai.js.org` entries (they already declare `hasDependencyOn`, so the delta adds relations for other software).
2. Phase 2 adds activities/workflow/queue; verified end-to-end via a client invocation against the Dagger environment (`devbox run up`), then `devbox run dump` shows the enriched dataset.
3. Rollback: unschedule the workflow run (it is on-demand, not a scheduled worker); re-seed the endpoint from the pristine catalog TTL to restore the prior dataset.

## Implementation Notes (deviations & fixes recorded during apply)

- **Compute moved from workflow to activity** (D5): `computeStatements` is a Temporal activity instead of pure in-workflow code. This keeps N3/Comunica (dynamic imports, heavy bundle) out of the workflow sandbox bundle and keeps the workflow trivially deterministic. Behavior is unchanged — the spec (compute + persist) is satisfied.
- **Endpoint overrides**: activities use `SPARQL_STORE_ENDPOINT` / `SPARQL_UPDATE_ENDPOINT` when set, falling back to `SPARQL_ENDPOINT` (the Dagger nginx proxy path). Direct Oxigraph needs the operation-specific paths; Dagger needs none.
- **Catalog source**: the workflow loads the catalog from `CATALOG_PATH` (file), `CATALOG_URL`, or the default raw URL — not `DATASET_PATH` (which feeds the UI demo dataset).
- **Sanitization**: one triple in the live catalog carries an RFC 3987-invalid IRI (`https://matrix.to/to/#/#solid_project`); Oxigraph rejects the whole POST body, so `sanitizeNQuads` drops such quads (logged) before seeding.
- **Pre-existing stack blocker** (not introduced by this change): `client.ts` executes `FediverseWorkflow` on the `fediverse` queue but no worker registers it since `dea9f23` — the Dagger client step hangs on it today. Fix pending user decision before the full Dagger e2e run.

## Phase 1 Findings (recorded for phase 2)

- Live run against the catalog: 51 new `hasDependencyOn` statements; zero duplicates of the 13 pre-existing ones; every emitted URI is a software URI with fetched package metadata.
- 54/163 software records map to a `package.json`; 22 repository fetches skipped — non-JS projects (Python/Rust/etc.), monorepo roots that declare no package `name` (`activitypods`, `comunica/comunica`), repos with no root `package.json`, and one bare host URL (`https://git.dokie.li/`).
- Real relations confirm the approach: e.g. `solid-vc` → `rdflib`, `solid-server` → `@solid/acl-check`/`@solid/oidc-auth-manager`/`@solid/oidc-op`.
- Popular packages (`@solid/community-server`, `@inrupt/solid-client`, `n3`, `@comunica/query-sparql`) currently have no catalog software whose package name matches — they are correctly treated as external dependencies.
- GitHub `HEAD` raw URL + exact-name matching is stable; fetch results vary slightly between runs (transient 404s), so phase 2 activities should retry with Temporal backoff (R2) and the analysis must remain idempotent at the triple level.

## Open Questions

- Downstream of this change: whether the delta should be folded into `solid-efforts-core` automatically (PR) or manually — decision deferred to whoever owns the upstream repo.
- Whether phase 2 runs on a schedule or on-demand — deferred until after the workflow is proven.
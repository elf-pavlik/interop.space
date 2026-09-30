# Design

## Context

See proposal.md — Why. The UI (`ui/`, Solid + Vite + Bun) already loads `ui/public/dump.nq` in a web worker (`ui/src/worker/state.worker.ts`) using N3 + @comunica/query-sparql-rdfjs, and streams one slice at a time to the main thread through a small actor bridge (`lib/actor.ts` → `store/app.ts`). Pages request slices on mount (`loadPeople`, `loadProjects`, `loadProject`). The dump is the enriched catalog dump using `http://example.org#` predicates (`ex:Person` ×323 all named, `ex:Organization` ×58, `ex:Software` ×163 all named, 64 `ex:hasDependencyOn` edges, 5 `ex:member` links). The current SPARQL queries ActivityStreams predicates (`as:name`, `as:Project`, ...) that do not exist in the dump, so People/Projects render nothing.

## Goals / Non-Goals

- Goals: people and projects pages driven by the catalog dump; new Software list view (name + dependency names); nav link added.
- Non-Goals: no software detail pages; no changes to the dump generation pipeline (this change only reads `dump.nq`); no server-side rendering or auth; no pagination (323/27/163 rows render fine in a grid).

## Decisions

### D1. Query the `ex:` namespace directly
Switch every SPARQL query in the worker from `as:` to `http://example.org#` predicates and the catalog's own types (`ex:Person`, `ex:Organization`, `ex:Software`, `ex:subType`, `ex:name`, `ex:description`, `ex:member`, `ex:hasDependencyOn`).
- *Alternative considered*: transforming the dump (e.g. mapping `ex:` → `as:`) before querying. Rejected — the dump is the source of truth; mapping adds a transformation layer with no benefit and breaks whenever the dump changes shape.
- Projects = `ex:Organization` filtered to `ex:subType` `OpenSourceProject` | `UniversityProject` (27 records), per the confirmed scope. The taxonomy namespace is `https://solidproject.solidcommunity.net/catalog/taxonomy#`.

### D2. Keep the worker/slice architecture; add a `software` slice
Extend `protocol.ts` with a `software: AsyncSlice<Software[]>` state key and a `loadSoftware` command, mirroring the existing people/projects pattern in `state.worker.ts`, `store/app.ts` (initial state), and `store/selectors.ts`. No new dependencies are required — N3 and Comunica are already in `ui/package.json`.

### D3. Carry full catalog URIs on records; resolve detail/by joins through them
Catalog identifiers are `urn:uuid:<uuid>` or https webids. Records keep the short form as `id` (URL/display) **and** a full `uri` field:
- `Person { id, uri, name, avatarUrl, handle? }`
- `Project { id, uri, name, description, memberIds }`
- `Software { id, uri, name, dependencies: string[] }` — `dependencies` holds the **names** of linked software (resolved in the worker), so the view is a plain list.
- `loadProject(id)`: resolve the project's URI by matching the stored `uri` tail against `id`, with a `urn:uuid:<id>` fallback (the old hard-coded `BIND (<urn:project:...)>)` binding no longer matches catalog URIs and is removed). Members are joined via `?org ex:member ?member` from that URI; member names/avatars reuse the person query. Sparse data (only 2 project-like orgs have members) is handled by the spec's empty-members state.
- *Alternative considered*: using full URIs in route params. Rejected — long/ugly URLs and no observable benefit; short ids with uri lookup keep URLs stable.

### D4. Software dependencies via two joins assembled in the worker
Run two queries: (a) all software names (`?s a ex:Software; ex:name ?name`), (b) all dependency edges (`?s ex:hasDependencyOn ?dep`). Assemble `Map<uri, name>` and `Map<uri, depUris>` in the worker, then emit `Software[]` with `dependencies` as names. This mirrors the existing projects/members assembly pattern and avoids Comunica `GROUP_CONCAT` string gymnastics.
- A `ex:hasDependencyOn` target with no `ex:name` (should not occur — targets are catalog software) falls back to its short uri.

### D5. Where the shared types and fixtures live
Move `Person`/`Project` (and add `Software`) type definitions into `src/worker/protocol.ts` (already the shared protocol/home of `AsyncSlice`). Delete the mock fixture lists `src/data/people.ts` and `src/data/projects.ts` — nothing imports them once the worker owns the data; the arrays they used are dead code.

### D6. Presentation
Reuse the existing card components/styling: `PersonCard` (name + avatar + id line) for people and members; project cards keep name/description/member-avatars; the Software view uses the same card grid with name and an indented/unordered dependency list. Avatar fallback stays robohash (catalog has no person images; `ex:webid`/`ex:forumHandle` are not images). Optionally surface `ex:forumHandle` as the card's secondary line instead of the raw short id for readability — falls back to the short id when absent.

## Risks / Trade-offs

- [Short-id collisions in detail routes (two URIs sharing a tail, e.g. same-name webid tails)] → exact `uri` tail match first; `urn:uuid:` fallback is unambiguous for uuid records; worst case the detail page resolves the first match (acceptable for a directory view).
- [Dump changes shape again (namespace/type drift)] → queries stay isolated in `state.worker.ts`; only that module uses the `ex:` vocabulary, so adapting later touches one file.
- [Dependency names are resolved at dump time; a dump without the derived edges shows empty lists] → by spec, software without dependencies shows an empty-dependencies state; no crash.

## Migration Plan

No data migration — the change is read-only against `ui/public/dump.nq`, which is regenerated by the existing Dagger dump flow. Rollback: `ui` is a static SPA; revert the worker/store/route changes.

## Open Questions

None.
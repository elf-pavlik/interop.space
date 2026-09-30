# Tasks

## 1. Types, protocol, and fixture cleanup

- [x] 1.1 Move the shared `Person` and `Project` types into `ui/src/worker/protocol.ts`, extend them with a full `uri` field (`id` stays the short display/URL form), add a new `Software` type (`id`, `uri`, `name`, `dependencies: string[]` of dependency names), add `software: AsyncSlice<Software[]>` to `AppState`, `{ type: 'loadSoftware' }` to `Command`, and `{ key: 'software'; ... }` to `SliceUpdate`; verify `bunx tsc --noEmit` passes in `ui/`
- [x] 1.2 Delete the mock fixtures `ui/src/data/people.ts` and `ui/src/data/projects.ts`, update every importer (`store/app.ts` initial state, `store/selectors.ts`, `components/PersonCard.tsx`, `routes/*`) to use the protocol types; verify `bunx tsc --noEmit` passes in `ui/`

## 2. Worker — catalog SPARQL

- [x] 2.1 Rewrite `sparqlPeople` in `ui/src/worker/state.worker.ts` to query the catalog namespace: `?id a ex:Person; ex:name ?name` with `OPTIONAL { ?id ex:forumHandle ?handle }` (EX = `http://example.org#`), keeping the robohash avatar fallback; verify by running `bun run dev` and checking `/people` lists catalog people (323 across the dump) instead of returning nothing
- [x] 2.2 Rewrite `sparqlProjects` to query `?id a ex:Organization; ex:name ?name` filtered to `ex:subType` values `https://solidproject.solidcommunity.net/catalog/taxonomy#OpenSourceProject` or `#UniversityProject`, with `OPTIONAL { ?id ex:description ?description }` and `OPTIONAL { ?id ex:member ?member }`; verify `/projects` lists 27 project-like organizations
- [x] 2.3 Rework `loadProject` in `state.worker.ts` to resolve the project's full URI (match the stored `uri` tail against the param, falling back to `urn:uuid:<id>`; drop the old `BIND (<urn:project:...>)`), then join members via `?org ex:member ?member` and fetch their names/avatars; verify `/projects/:id` resolves both a uuid-id org and a webid-hosted org, and shows the empty-members state for orgs with no `ex:member` links
- [x] 2.4 Add `sparqlSoftware` + `loadSoftware` to `state.worker.ts`: two queries — (a) `?s a ex:Software; ex:name ?name` and (b) `?s ex:hasDependencyOn ?dep` — assembled in the worker into `Software[]` with `dependencies` as dependency **names** (targets without a name fall back to their short uri); verify `/software` lists 163 entries and spot-check that WebClip shows `rdflib` among its dependencies in the dump

## 3. Store and views

- [x] 3.1 Register the `software` slice in `ui/src/store/app.ts` initial state and expose `softwareSlice` in `ui/src/store/selectors.ts`; verify `bunx tsc --noEmit` passes
- [x] 3.2 Add `ui/src/routes/Software.tsx` (same list-grid pattern as People: status switch, `loadSoftware` on mount, card per software showing name plus its dependency names as a list, empty-dependencies state) and wire it into `ui/src/App.tsx` as the `/software` route with a header nav link; verify the nav renders and `/software` shows software names with dependency lists
- [x] 3.3 Update `ui/src/routes/People.tsx` / `Projects.tsx` / `ProjectDetail.tsx` and `PersonCard` for the moved types and new fields (e.g. show `forumHandle` when present); verify `bunx tsc --noEmit` passes and `/people` still renders cards with names

## 4. Integration verification

- [x] 4.1 Run `bun run build` in `ui/` and verify it completes; then in `bun run dev` confirm the header links People / Projects / Software all navigate to pages populated from the catalog dump (people ≈ 323, projects = 27, software = 163 with dependency names) and the People page no longer shows the fixture names (Ada, Alan, …)
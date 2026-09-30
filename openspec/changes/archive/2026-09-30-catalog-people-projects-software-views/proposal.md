# Proposal

## Why

The UI (`ui/`) was built against mock data and ActivityStreams-shaped SPARQL (`as:name`, `as:Project`, `as:member`, `as:icon`), but `ui/public/dump.nq` now carries the real Solid efforts catalog with `http://example.org#` predicates (`ex:`) — including 323 `ex:Person`, 58 `ex:Organization` (27 project-like), and 163 `ex:Software` entries that now carry derived `ex:hasDependencyOn` edges. The existing People and Projects pages query predicates that do not exist in the dump and therefore render nothing. The catalog is the source of truth, so the UI should display people and projects from it, and surface the newly derived software dependency data.

## What Changes

- **People from the catalog**: the People page (`/people`) is driven by catalog `ex:Person` records (`ex:name`, `ex:webid`, `ex:forumHandle`) instead of the current ActivityStreams query. Cards keep the existing name + avatar presentation; robohash remains the avatar fallback since the catalog carries no person images.
- **Projects from the catalog**: the Projects page (`/projects`) is driven by catalog `ex:Organization` records whose `ex:subType` is project-like (`OpenSourceProject`, `UniversityProject`). Project cards show the organization name and description (when present); project members come from `ex:member` links to people.
- **Software view (new)**: a `/software` list page showing every catalog `ex:Software` entry with its name and the names of its dependencies, resolved from `ex:hasDependencyOn` edges to the dependency's own `ex:name`. List page only — no detail pages.
- **Navigation**: `Software` link added to the site header alongside People and Projects.

## Capabilities

### New Capabilities
- `catalog-views`: displaying the Solid efforts catalog in the web UI — catalog people, project-like organizations, and software entries with their dependency lists, all read from the `dump.nq` RDF dump via SPARQL in the UI worker.

### Modified Capabilities
- None (the project has no existing specs yet).

## Impact

- `ui/src/worker/protocol.ts`: new `software` slice and `loadSoftware` command; `Person`/`Project` field adjustments (e.g. carry the full catalog URI for detail lookup).
- `ui/src/worker/state.worker.ts`: replace `as:` predicates with `ex:` (`http://example.org#`) in the people and projects SPARQL; add software + dependency-name SPARQL.
- `ui/src/store/app.ts` / `ui/src/store/selectors.ts`: software slice registered; selectors for software and software dependencies.
- `ui/src/routes/Software.tsx` (new), `ui/src/App.tsx` (route + nav link), `ui/src/routes/People.tsx`, `ui/src/routes/Projects.tsx` (query tags), `ui/src/routes/ProjectDetail.tsx` (member lookup against catalog URIs).
- `ui/src/data/people.ts` / `ui/src/data/projects.ts`: mock-only fixtures become unused and are removed.
- No new dependencies (n3 and @comunica are already in `ui/package.json`).
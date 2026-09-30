# Spec Delta

## Purpose

Derives `ex:hasDependencyOn` relations between software entries in the Solid efforts catalog from the repositories' `package.json` files, both as a standalone delta analysis and as a Temporal workflow that enriches the SPARQL dataset.

## ADDED Requirements

### Requirement: Enumerate catalog software and repositories
The system SHALL read a TTL catalog dataset (e.g. `catalog-data.ttl`) into an in-memory RDF dataset and query it to enumerate every resource typed as `ex:Software` together with all of its `ex:repository` values. Resources without any `ex:repository` SHALL be reported but not fail the run.

#### Scenario: Catalog dataset with software records
- **WHEN** the dataset contains `ex:Software` resources, some with an `ex:repository` and some without
- **THEN** every software resource is enumerated with its repository URIs, and software without repositories is listed in the run summary

### Requirement: Fetch package.json from repository root
For each repository the system SHALL attempt to fetch `package.json` from the repository root. A repository whose root has no `package.json` SHALL be skipped and reported. Unfetchable repositories (network errors, non-200 responses) SHALL be reported and skipped without aborting the run.

#### Scenario: Repository provides package.json at root
- **WHEN** the repository root serves a `package.json` (e.g. a GitHub repo fetched from the raw content host with its default-branch `HEAD` ref)
- **THEN** the `package.json` is parsed and recorded for that repository

#### Scenario: Repository without package.json
- **WHEN** the repository root returns no `package.json` (missing file or unsupported host)
- **THEN** the repository is skipped and recorded in the run summary

### Requirement: Map software to package metadata
The system SHALL maintain a map from each software URI to the parsed package metadata (package `name` and dependency declarations) gathered from its repositories. Software entries whose repositories yield no `package.json` SHALL appear in the run summary as not mapped.

#### Scenario: Software with a parsed package
- **WHEN** a software resource has at least one repository with a parseable `package.json`
- **THEN** the map contains that software URI with its package name and dependency declarations

### Requirement: Compute hasDependencyOn statements
The system SHALL compute `ex:hasDependencyOn` statements between software URIs: a statement `<A> ex:hasDependencyOn <B>` SHALL be emitted when a dependency name declared in software A's package metadata matches the package name of software B. All dependency sections SHALL be considered: `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`. The system SHALL NOT emit statements for dependency names that match no catalog software.

#### Scenario: Software depends on another catalog software
- **WHEN** software A's package.json declares a dependency whose name equals software B's package name
- **THEN** the system emits `<A> ex:hasDependencyOn <B>`

#### Scenario: Dependency not in the catalog
- **WHEN** software A declares a dependency that matches no catalog software package name
- **THEN** no `hasDependencyOn` statement is emitted for that dependency

### Requirement: Emit only new statements
The system SHALL emit as output only the newly computed `hasDependencyOn` statements, preserving any statements already present in the input dataset. Statements identical to existing ones SHALL NOT be emitted twice.

#### Scenario: Statement already present in the dataset
- **WHEN** a computed dependency statement already exists in the input dataset
- **THEN** the output delta does not repeat it

### Requirement: Persist enriched dataset to a SPARQL endpoint
The system SHALL be able to seed the catalog dataset into a SPARQL endpoint, apply the computed `hasDependencyOn` statements as a SPARQL UPDATE, and leave the endpoint queryable so that a subsequent dump of the endpoint contains the enriched dataset.

#### Scenario: Endpoint updated with dependency statements
- **WHEN** the catalog dataset has been seeded to the endpoint and the dependency statements have been applied via SPARQL UPDATE
- **THEN** a query for `ex:hasDependencyOn` on the endpoint returns the applied statements alongside the seeded data
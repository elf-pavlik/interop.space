# Spec Delta

## Purpose

Displays the Solid efforts catalog in the web UI: people and project-like organizations from the catalog dump, plus software entries with their derived dependency lists.

## ADDED Requirements

### Requirement: Data driven by the catalog dump
The system SHALL populate the People, Projects, and Software views from the current catalog RDF dump rather than from hardcoded data. The set of items shown SHALL reflect the records present in the dump (`ex:Person`, `ex:Organization`, `ex:Software`), not a fixed list.

#### Scenario: Catalog records change
- **WHEN** the catalog dump contains a different set of people, organizations, or software entries
- **THEN** the People, Projects, and Software views reflect those records without code changes

### Requirement: Display catalog people
The system SHALL display a People view listing every resource typed as `ex:Person` in the catalog, using the person's `ex:name` as the displayed name. People without an image in the catalog SHALL be shown with a generated placeholder avatar derived from their identifier.

#### Scenario: Catalog contains person records
- **WHEN** the catalog dump contains `ex:Person` resources with `ex:name` values
- **THEN** the People view lists each person with their name and a placeholder avatar

### Requirement: Display project-like organizations as projects
The system SHALL display a Projects view listing catalog `ex:Organization` resources whose `ex:subType` is `OpenSourceProject` or `UniversityProject`, using the organization's `ex:name` as the project name and its `ex:description` (when present) as the description. Organizations with other subtypes SHALL NOT appear in the Projects view.

#### Scenario: Organization with a project subtype
- **WHEN** the catalog contains an `ex:Organization` with `ex:subType` `OpenSourceProject` or `UniversityProject`
- **THEN** the Projects view shows it with its name and description (when the description exists)

#### Scenario: Organization without a project subtype
- **WHEN** the catalog contains an `ex:Organization` whose `ex:subType` is not project-like
- **THEN** the Projects view does not show it

### Requirement: Show project members
The system SHALL resolve project members through `ex:member` links from the organization to `ex:Person` resources and display them alongside the project. When a project has no member links, the system SHALL show an empty-members state rather than an error.

#### Scenario: Project with members
- **WHEN** a project-like organization has `ex:member` links to catalog people
- **THEN** those people are displayed as the project's members

#### Scenario: Project without members
- **WHEN** a project-like organization has no `ex:member` links
- **THEN** an empty-members state is shown

### Requirement: Display software with dependencies
The system SHALL display a Software view listing every catalog `ex:Software` entry with its `ex:name` and the names of its dependencies, where a dependency is a `ex:hasDependencyOn` target and its name comes from the target's own `ex:name`.

#### Scenario: Software with dependencies
- **WHEN** a catalog software entry has `ex:hasDependencyOn` links to other catalog software entries
- **THEN** the Software view shows the software's name followed by the names of the linked software

#### Scenario: Software without dependencies
- **WHEN** a catalog software entry has no `ex:hasDependencyOn` links
- **THEN** the Software view still shows the software's name, with an empty-dependencies state

### Requirement: Navigate between views
The system SHALL provide navigation links to the People, Projects, and Software views from the site header.

#### Scenario: Header navigation
- **WHEN** a user opens the site
- **THEN** the header offers navigation to People, Projects, and Software views, each of which renders the corresponding listing
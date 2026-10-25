// Temporal activities for the W3C API workflow. Network I/O, seed loading and
// RDF building live here; the workflow stays deterministic and only sequences.
//
// The run seeds Oxigraph with the previous dump when it exists, so the dump is
// the crawl state. With upstream data treated as frozen, existence in the seed
// means "already fetched": people already linked to a W3C group and groups
// already present are skipped. Without a dump, the crawl starts from one
// hardcoded GitHub username.
import { readFile } from 'node:fs/promises'
import w3capi from 'node-w3capi'
import pThrottle from 'p-throttle'
import { endpointFor, sanitizeNQuads } from '../software-dependencies/activities.ts'
import { buildPersonNameIndex } from '../specref/authors.ts'
import { linkSpecifications } from '../specref/link.ts'
import { specrefMetadataDeleteUpdate } from '../specref/metadata.ts'
import {
  DEFAULT_SPECREF_URL,
  loadSpecrefEntries,
} from '../specref/source.ts'
import {
  buildEditorQuads,
  buildSpecificationQuads,
  buildStartPersonQuads,
  buildW3cQuads,
  collectPeople,
  readDataset,
  serializeQuads,
} from './analysis.ts'
import type {
  W3cEditor,
  W3cGroupParticipants,
  W3cGroupRef,
  W3cGroupSpecifications,
  W3cParticipant,
  W3cSpecification,
  W3cSpecificationEditors,
} from './analysis.ts'
import type {
  W3cApiGroupDetail,
  W3cApiSpecification,
  W3cApiUserDetail,
} from 'node-w3capi'
import { canonicalW3cId } from './person-ids.ts'

/** ui/public/dump.nq in the repo; Dagger mounts it at DUMP_PATH. */
export const DEFAULT_DUMP_PATH = new URL(
  '../../../ui/public/dump.nq',
  import.meta.url,
).pathname

/** Crawl roots for a run without a previous dump. */
const FALLBACK_GITHUB_USERNAMES = ['elf-pavlik', 'TallTed', 'pchampin', 'plehegar']

const W3C_API = 'https://api.w3.org'
const GITHUB_API = 'https://api.github.com'

/** api.w3.org pages at 100 items by default; ask for the maximum instead. */
const ITEMS_PER_PAGE = 1000

/**
 * Everything later activities need to reconstruct the seed graph. The dump
 * itself is passed by path, not by value: it grows with every run and would
 * blow past Temporal's payload limits.
 */
export interface SeedRef {
  /** Dump file on the worker, when the previous dump exists. */
  path?: string
  /** Small generated start record, when no dump (or no GitHub account) exists. */
  extraNQuads?: string
  source: string
  people: number
  /** People without any W3C group membership in the seed. */
  pendingPeople: number
  knownGroups: number
}

function joinNQuads(base: string, extra: string): string {
  if (!base) return extra
  if (!extra) return base
  return `${base}${base.endsWith('\n') ? '' : '\n'}${extra}`
}

/** The seed graph: the dump (if present) plus any generated start record. */
export async function readSeed(seed: SeedRef): Promise<string> {
  const base = seed.path ? await readFile(seed.path, 'utf-8') : ''
  return joinNQuads(base, seed.extraNQuads ?? '')
}

interface GithubUser {
  id: number
  login: string
  name: string | null
  html_url: string
  avatar_url: string
}

async function fetchGithubUser(username: string): Promise<GithubUser> {
  const url = `${GITHUB_API}/users/${encodeURIComponent(username)}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'interop.space',
    },
  })
  if (!response.ok) {
    throw new Error(
      `GitHub API ${url}: HTTP ${response.status} ${response.statusText}`,
    )
  }
  return (await response.json()) as GithubUser
}

/** The opaque user id api.w3.org uses in URLs, from a fetched user detail. */
function opaqueUserId(detail: W3cApiUserDetail): string {
  const id = detail._links?.self?.href?.split('/').filter(Boolean).pop()
  if (!id) {
    throw new Error(`W3C API user ${detail.id} has no self link`)
  }
  return id
}

// Start-person lookups are one request each; keep them under the API's rate
// limit even when a dump contributes many accounts.
const throttledUserFetch = pThrottle({ limit: 10, interval: 1000 })

const fetchW3cUserByGithub = throttledUserFetch((githubId: string) =>
  w3capi.user({ type: 'github', id: githubId }).fetch(),
)

/** Build the seed records used when there is no dump to start from. */
async function buildFallbackSeed(): Promise<string> {
  const records: string[] = []
  for (const username of FALLBACK_GITHUB_USERNAMES) {
    const github = await fetchGithubUser(username)
    const detail = await fetchW3cUserByGithub(String(github.id))
    records.push(
      serializeQuads(
        buildStartPersonQuads({
          name: detail.name ?? github.name ?? github.login,
          githubId: String(github.id),
          githubUsername: github.login,
          w3cId: detail.id,
          w3cApiUrl: detail._links?.self?.href,
          logo: github.avatar_url,
        }),
      ),
    )
  }
  return records.join('\n')
}

/**
 * Load the previous dump when it exists, otherwise generate a seed from the
 * fallback GitHub account. The seed graph is parsed here so the workflow knows
 * how many people/groups it already has without carrying the graph itself.
 */
export async function loadSeed(): Promise<SeedRef> {
  const path = process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH
  let base: string | null = null
  try {
    base = await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }

  let nquads = base ?? ''
  let parsed = await readDataset(nquads)
  let extraNQuads: string | undefined

  if (parsed.accounts.length === 0) {
    extraNQuads = await buildFallbackSeed()
    nquads = joinNQuads(nquads, extraNQuads)
    parsed = await readDataset(nquads)
  }

  const fallbackSource = `github:${FALLBACK_GITHUB_USERNAMES.join(',')}`
  const source =
    base === null
      ? fallbackSource
      : extraNQuads
        ? `${path} + ${fallbackSource}`
        : path

  return {
    ...(base !== null ? { path } : {}),
    ...(extraNQuads ? { extraNQuads } : {}),
    source,
    people: parsed.accounts.length,
    pendingPeople: parsed.accounts.filter((account) => !account.hasW3cGroups)
      .length,
    knownGroups: parsed.groupIds.length,
  }
}

/**
 * One W3C API list page-set. `items=1000` keeps pagination to a minimum (the
 * API defaults to 100), and `embed=true` returns full objects instead of links
 * so no follow-up requests are needed per item.
 */
async function fetchW3cList<T>(path: string, key: string): Promise<T[]> {
  const items: T[] = []
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const url = new URL(path, W3C_API)
    url.searchParams.set('embed', 'true')
    url.searchParams.set('items', String(ITEMS_PER_PAGE))
    url.searchParams.set('page', String(page))
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(
        `W3C API ${url}: HTTP ${response.status} ${response.statusText}`,
      )
    }
    const body = (await response.json()) as {
      pages?: number
      _embedded?: Record<string, T[]>
    }
    items.push(...(body._embedded?.[key] ?? []))
    pages = body.pages ?? 1
  }
  return items
}

/** The opaque W3C user id when the person URI already is an API user URI. */
function opaqueUserIdFromPersonUri(personUri: string): string | undefined {
  const prefix = `${W3C_API}/users/`
  if (!personUri.startsWith(prefix)) return undefined
  const id = personUri.slice(prefix.length)
  return id && !id.includes('/') ? id : undefined
}

export interface GroupCrawlResult {
  /** Groups discovered from pending people that the seed did not have. */
  groups: W3cGroupRef[]
  /** Seed groups without specs plus the groups discovered in this run. */
  specificationGroups: W3cGroupRef[]
}

/**
 * Fetch the groups of seed people that have no W3C group at all, and collect
 * the groups whose specifications still need to be fetched. People already
 * linked to a W3C group are left alone: with frozen upstream data we treat
 * their existing memberships as fetched, even though that does not discover
 * groups beyond the ones already in the graph.
 *
 * Each account's GitHub id resolves to the W3C user (the numeric W3C id alone
 * is not a valid API path), unless the person URI already is the opaque W3C
 * user URI — then that id is used directly, saving the lookup request.
 */
export async function listW3cUserGroups(
  seed: SeedRef,
): Promise<GroupCrawlResult> {
  const { accounts, groupIds, groupsWithoutSpecs } = await readDataset(
    await readSeed(seed),
  )
  const pending = accounts.filter((account) => !account.hasW3cGroups)

  const known = new Set(groupIds)
  const groups = new Map<string, W3cGroupRef>()
  for (const account of pending) {
    let opaque = opaqueUserIdFromPersonUri(account.personUri)
    if (!opaque) {
      const detail = await fetchW3cUserByGithub(account.githubId)
      opaque = opaqueUserId(detail)
    }
    const userGroups = await fetchW3cList<W3cApiGroupDetail>(
      `/users/${opaque}/groups`,
      'groups',
    )
    for (const group of userGroups) {
      if (known.has(group.id)) continue
      const apiUrl = group._links?.self?.href
      if (!apiUrl || !Number.isInteger(group.id)) continue
      const homepage = group._links?.homepage?.href
      const uri = homepage ?? apiUrl
      groups.set(uri, {
        uri,
        apiUrl,
        ...(homepage ? { homepage } : {}),
        id: group.id,
        name: group.name,
        ...(group.shortname ? { shortname: group.shortname } : {}),
        ...(group.type ? { type: group.type } : {}),
      })
    }
  }

  const specificationGroups = new Map<number, W3cGroupRef>()
  for (const group of [...groupsWithoutSpecs, ...groups.values()]) {
    specificationGroups.set(group.id, group)
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    specificationGroups: [...specificationGroups.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }
}

/**
 * Participants of one W3C group, as api.w3.org lists them.
 *
 * `embed` returns each participant's numeric W3C user id, name, self link,
 * photos and connected accounts in the same response, so one request per
 * 1000 participants is enough. The numeric W3C id joins against the seed's
 * "w3c:<id>" siloIds; the GitHub account lets future dumps crawl from them.
 */
export async function fetchW3cParticipants(
  groupId: number,
): Promise<W3cParticipant[]> {
  const users = await fetchW3cList<W3cApiUserDetail>(
    `/groups/${groupId}/users`,
    'users',
  )
  const participants: W3cParticipant[] = []
  for (const user of users) {
    const href = user._links?.self?.href
    if (!href || !Number.isInteger(user.id) || !user.name) continue
    const github = user['connected-accounts']?.find(
      (account) => account.service === 'github',
    )
    participants.push({
      id: user.id,
      href,
      name: user.name,
      photo: pickPhoto(user),
      ...(github
        ? { githubId: github.identifier, githubUsername: github.nickname }
        : {}),
    })
  }
  return participants.sort((a, b) => a.name.localeCompare(b.name))
}

/** The API's thumbnail photo for a user, when the account has one. */
function pickPhoto(user: W3cApiUserDetail): string | undefined {
  const photos = user._links?.photos ?? []
  return (photos.find((photo) => photo.name === 'thumbnail') ?? photos[0])?.href
}

/**
 * A run stores ~10k quads, which is more than the nginx proxy accepts in one
 * request (its default body limit is 1 MB; oversized uploads get their socket
 * closed before the 413 is readable). Send small batches instead so every
 * request stays well below any proxy limit and a retry only repeats one batch.
 */
const STORE_BATCH_SIZE = 500

async function postNQuads(what: string, nquads: string): Promise<void> {
  const endpoint = endpointFor('store')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/n-quads' },
    body: nquads,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to store ${what} at ${endpoint}: HTTP ${response.status} ${response.statusText}`,
    )
  }
}

async function postUpdate(what: string, update: string): Promise<void> {
  const endpoint = endpointFor('update')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: update,
  })
  if (!response.ok) {
    throw new Error(
      `Failed to update ${what} at ${endpoint}: HTTP ${response.status} ${response.statusText}`,
    )
  }
}

/** Split N-Quads text into batches. N-Quads is line-oriented (one quad/line). */
function batchNQuads(nquads: string, size: number): string[] {
  const lines = nquads.split('\n').filter((line) => line.trim() !== '')
  const batches: string[] = []
  for (let i = 0; i < lines.length; i += size) {
    batches.push(lines.slice(i, i + size).join('\n') + '\n')
  }
  return batches
}

/** Load the seed graph into the SPARQL store as-is (dump or generated record). */
export async function seedBase(seed: SeedRef): Promise<string> {
  const { quads, dropped } = sanitizeNQuads(await readSeed(seed))
  if (dropped > 0) {
    console.warn(`seedBase: dropped ${dropped} quads with invalid IRIs`)
  }
  for (const batch of batchNQuads(quads, STORE_BATCH_SIZE)) {
    await postNQuads('seed', batch)
  }
  return 'Seed graph loaded successfully'
}

/** The specifications delivered by one W3C group. */
export async function fetchW3cSpecifications(
  groupId: number,
): Promise<W3cSpecification[]> {
  const specs = await fetchW3cList<W3cApiSpecification>(
    `/groups/${groupId}/specifications`,
    'specifications',
  )
  const specifications: W3cSpecification[] = []
  for (const spec of specs) {
    const apiUrl = spec._links?.self?.href
    const uri = spec.shortlink
    if (!apiUrl || !uri || !spec.title) continue
    specifications.push({
      uri,
      apiUrl,
      title: spec.title,
      shortname: spec.shortname,
      editorDraft: spec['editor-draft'],
      latestVersionUrl: spec._links?.['latest-version']?.href,
    })
  }
  return specifications.sort((a, b) =>
    (a.shortname ?? a.title).localeCompare(b.shortname ?? b.title),
  )
}

const fetchEditorList = pThrottle({ limit: 10, interval: 1000 })(
  (url: string) => fetchW3cList<W3cApiUserDetail>(url, 'editors'),
)

/**
 * Editors of the latest W3C API version of each specification. The API exposes
 * editors per version; versions are not modeled yet, so the spec node points at
 * the editor and records the latest version URL as provenance.
 */
export async function fetchW3cEditors(
  specifications: W3cSpecification[],
): Promise<W3cSpecificationEditors[]> {
  const unique = new Map<string, W3cSpecification>()
  for (const specification of specifications) {
    unique.set(specification.uri, specification)
  }

  return Promise.all(
    [...unique.values()].map(async (specification) => {
      if (!specification.latestVersionUrl) {
        return { specification, editors: [] }
      }
      const users = await fetchEditorList(
        `${specification.latestVersionUrl}/editors`,
      )
      const editors: W3cEditor[] = []
      for (const user of users) {
        const href = user._links?.self?.href
        if (!href || !Number.isInteger(user.id) || !user.name) continue
        const github = user['connected-accounts']?.find(
          (account) => account.service === 'github',
        )
        editors.push({
          id: user.id,
          href,
          name: user.name,
          photo: pickPhoto(user),
          ...(github
            ? {
                githubId: github.identifier,
                githubUsername: github.nickname,
              }
            : {}),
        })
      }
      return {
        specification,
        editors: editors.sort((a, b) => a.name.localeCompare(b.name)),
      }
    }),
  )
}

/**
 * Add only the groups the dump does not have yet, plus their participants and
 * the specifications for groups that have none. The seed graph is parsed again
 * here (not passed as quads) so people it already knows — including the seed
 * person — keep their URI and name instead of being forked. Specs already in
 * the seed are enriched from Specref too, so an existing dump can gain the
 * bibliography metadata without a full recrawl.
 */
export async function storeW3cData(
  seed: SeedRef,
  groups: W3cGroupParticipants[],
  specifications: W3cGroupSpecifications[],
): Promise<string> {
  const {
    knownPersonIds,
    specifications: seedSpecifications,
    people: seedPeople,
  } = await readDataset(await readSeed(seed))

  // Enrich specs already in the seed too, so an existing dump can gain Specref
  // metadata without a full recrawl. A spec can be delivered by more than one
  // group, so key by subject and let freshly fetched data win.
  const specByUri = new Map<string, W3cSpecification>()
  for (const spec of seedSpecifications) specByUri.set(spec.uri, spec)
  for (const group of specifications) {
    for (const spec of group.specifications) specByUri.set(spec.uri, spec)
  }
  const specs = [...specByUri.values()]

  const [editorData, specref] = await Promise.all([
    fetchW3cEditors(specs),
    loadSpecrefEntries(
      process.env.SPECREF_PATH,
      process.env.SPECREF_URL ?? DEFAULT_SPECREF_URL,
    ),
  ])
  const { entries, source } = specref

  const participantIds = new Set(
    groups.flatMap((group) =>
      group.participants.map((p) => canonicalW3cId(p.id)),
    ),
  )
  const personIds = new Set([...knownPersonIds, ...participantIds])
  const people = collectPeople(
    seedPeople,
    groups,
    editorData,
    knownPersonIds,
  )
  const authorIndex = buildPersonNameIndex(people)
  const linked = linkSpecifications(specs, entries, { authorIndex })

  // Replace stale Specref metadata so manual author-map changes take effect on
  // an existing dump instead of leaving the old literal creator behind.
  const metadataDelete = specrefMetadataDeleteUpdate(
    specs.map((spec) => spec.uri),
  )
  if (metadataDelete) await postUpdate('Specref metadata', metadataDelete)

  const quads = [
    ...buildW3cQuads(groups, knownPersonIds),
    ...buildSpecificationQuads(specifications),
    ...buildEditorQuads(editorData, personIds),
    ...linked.quads,
  ]
  for (let i = 0; i < quads.length; i += STORE_BATCH_SIZE) {
    await postNQuads(
      'W3C groups',
      serializeQuads(quads.slice(i, i + STORE_BATCH_SIZE)),
    )
  }
  const participantCount = participantIds.size
  const editorCount = new Set(
    editorData.flatMap((entry) => entry.editors.map((editor) => editor.id)),
  ).size
  const specCount = specifications.reduce(
    (n, group) => n + group.specifications.length,
    0,
  )

  const collisionReport = linked.collisions.map((collision) => ({
    key: collision.key,
    spec: collision.target,
    candidates: collision.candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      href: candidate.href,
      edDraft: candidate.edDraft,
      status: candidate.status,
      publisher: candidate.publisher,
      deliveredBy: candidate.deliveredBy,
    })),
  }))
  if (collisionReport.length > 0) {
    console.warn(
      `Specref collisions:\n${JSON.stringify(collisionReport, null, 2)}`,
    )
  }

  const authorProblems = linked.authors.filter(
    (author) => author.status === 'unmatched' || author.status === 'ambiguous',
  )
  const authorCounts = {
    matched: linked.authors.filter((author) => author.status === 'matched').length,
    override: linked.authors.filter((author) => author.status === 'override').length,
    unmatched: linked.authors.filter((author) => author.status === 'unmatched').length,
    ambiguous: linked.authors.filter((author) => author.status === 'ambiguous').length,
  }

  const enrichment = {
    source,
    matched: linked.matches.length,
    byKey: linked.byKey,
    collisions: collisionReport,
    unmatched: linked.unmatched,
    editors: editorCount,
    authors: {
      counts: authorCounts,
      problems: authorProblems,
    },
  }

  return `Stored ${quads.length} quads for ${participantCount} participants, ${editorCount} editors, ${groups.length} groups and ${specCount} specs in ${specifications.length} groups\nSpecref: ${JSON.stringify(enrichment, null, 2)}`
}

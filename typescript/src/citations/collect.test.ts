import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import { collectCitations, type FetchLike } from './collect.ts'
import type { CatalogSpec } from './types.ts'

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

const specs: CatalogSpec[] = [
  {
    uri: 'https://www.w3.org/TR/css-flexbox-1/',
    shortname: 'css-flexbox-1',
    latestVersionUrl:
      'https://api.w3.org/specifications/css-flexbox-1/versions/20250101',
  },
  {
    uri: 'https://www.w3.org/TR/json-ld11/',
    shortname: 'json-ld11',
  },
  {
    uri: 'https://www.w3.org/TR/old/',
    shortname: 'old',
    latestVersionUrl:
      'https://api.w3.org/specifications/old/versions/20000101',
  },
  {
    uri: 'https://www.w3.org/TR/missing/',
    shortname: 'missing',
    latestVersionUrl:
      'https://api.w3.org/specifications/missing/versions/20200101',
  },
]

function response(body: string, status = 200, statusText = 'OK'): Response {
  return new Response(body, { status, statusText })
}

describe('collectCitations', () => {
  test('fetches latest versions, resolves W3C targets and reports failures', async () => {
    const bikeshed = await fixture('bikeshed.html')
    const old = await fixture('old.html')
    const responses = new Map<string, Response>([
      [
        'https://api.w3.org/specifications/css-flexbox-1/versions/20250101',
        response(
          JSON.stringify({
            uri: 'https://www.w3.org/TR/2025/CR-css-flexbox-1-20250101/',
          }),
        ),
      ],
      [
        'https://www.w3.org/TR/2025/CR-css-flexbox-1-20250101/',
        response(bikeshed),
      ],
      [
        'https://api.w3.org/specifications/old/versions/20000101',
        response(
          JSON.stringify({
            uri: 'https://www.w3.org/TR/2000/REC-old-20000101/',
          }),
        ),
      ],
      ['https://www.w3.org/TR/2000/REC-old-20000101/', response(old)],
    ])

    const calls: string[] = []
    const fetchImpl: FetchLike = async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      calls.push(url)
      return responses.get(url) ?? response('not found', 404, 'Not Found')
    }

    const { citations, report } = await collectCitations(specs, {
      fetchImpl,
      concurrency: 2,
      rateLimit: { limit: 100, interval: 1 },
      timeoutMs: 5_000,
    })

    // Every W3C API version lookup finishes before the first TR crawl.
    const lastApi = calls.findLastIndex((url) =>
      url.startsWith('https://api.w3.org/'),
    )
    const firstHtml = calls.findIndex((url) =>
      url.startsWith('https://www.w3.org/TR/'),
    )
    expect(lastApi).toBeGreaterThanOrEqual(0)
    expect(firstHtml).toBeGreaterThan(lastApi)

    expect(citations).toEqual([
      {
        source: 'https://www.w3.org/TR/css-flexbox-1/',
        target: 'https://www.w3.org/TR/json-ld11/',
        nature: 'informative',
        key: 'JSON-LD11',
      },
    ])

    expect(report.totals).toMatchObject({
      documents: 3,
      ok: 1,
      failed: 2,
      normative: 4,
      informative: 1,
      resolved: 1,
      skippedNonW3c: 1,
      skippedOutOfCatalog: 1,
      unresolved: 1,
      selfReferences: 1,
      conflicts: 1,
    })

    const bySpec = new Map(
      report.documents.map((document) => [document.spec, document]),
    )
    const flexbox = bySpec.get('https://www.w3.org/TR/css-flexbox-1/')
    expect(flexbox?.status).toBe('ok')
    expect(flexbox?.generator).toBe('bikeshed')
    expect(flexbox?.versionUri).toBe(
      'https://www.w3.org/TR/2025/CR-css-flexbox-1-20250101/',
    )
    expect(flexbox?.skippedOutOfCatalog).toEqual([
      { key: 'OLD', url: 'https://www.w3.org/TR/2020/REC-retired-20200101/' },
    ])
    expect(flexbox?.unresolved).toEqual([
      { key: 'NOLINK', reason: 'no link in entry' },
    ])

    expect(bySpec.get('https://www.w3.org/TR/old/')?.status).toBe(
      'unsupported',
    )
    expect(bySpec.get('https://www.w3.org/TR/missing/')?.status).toBe(
      'version-failed',
    )
  })
})

describe('collectCitations rate limiting', () => {
  test('caps Retry-After and stops at the run deadline', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '3600' },
      })
    const started = Date.now()
    const { report } = await collectCitations(
      [
        {
          uri: 'https://www.w3.org/TR/rate-limited/',
          latestVersionUrl:
            'https://api.w3.org/specifications/rate-limited/versions/20250101',
        },
      ],
      {
        fetchImpl,
        rateLimit: { limit: 100, interval: 1 },
        maxDurationMs: 100,
      },
    )
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(report.documents[0]?.status).toBe('version-failed')
    expect(report.documents[0]?.error).toContain('429')
  })
})

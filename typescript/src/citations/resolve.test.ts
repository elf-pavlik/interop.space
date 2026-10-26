import { describe, expect, test } from 'bun:test'
import {
  buildCatalogIndex,
  resolveReferences,
} from './resolve.ts'
import type { CatalogSpec } from './types.ts'
import { shortlinkFromDatedTrUrl } from './urls.ts'

const specs: CatalogSpec[] = [
  { uri: 'https://www.w3.org/TR/css-flexbox-1/', shortname: 'css-flexbox-1' },
  { uri: 'https://www.w3.org/TR/json-ld11/', shortname: 'json-ld11' },
  { uri: 'https://www.w3.org/TR/did-core/', shortname: 'did-core' },
  {
    uri: 'https://www.w3.org/TR/vc-data-model-2.0/',
    shortname: 'vc-data-model-2.0',
  },
]

const index = buildCatalogIndex(specs)
const source = specs[0]!

describe('shortlinkFromDatedTrUrl', () => {
  test('maps a dated TR snapshot to its shortlink', () => {
    expect(
      shortlinkFromDatedTrUrl(
        'https://www.w3.org/TR/2022/REC-did-core-20220719/',
      ),
    ).toBe('https://www.w3.org/TR/did-core/')
    expect(
      shortlinkFromDatedTrUrl('https://www.w3.org/TR/2020/REC-json-ld11-20200716/'),
    ).toBe('https://www.w3.org/TR/json-ld11/')
  })

  test('ignores shortlinks and non-TR URLs', () => {
    expect(
      shortlinkFromDatedTrUrl('https://www.w3.org/TR/did-core/'),
    ).toBeUndefined()
    expect(
      shortlinkFromDatedTrUrl('https://dom.spec.whatwg.org/'),
    ).toBeUndefined()
  })
})

describe('resolveReferences', () => {
  test('resolves direct and dated TR targets and reports the rest', () => {
    const result = resolveReferences(
      source,
      [
        {
          key: 'JSON-LD11',
          nature: 'normative',
          targetUrl: 'https://www.w3.org/TR/json-ld11/',
        },
        {
          key: 'DATED',
          nature: 'informative',
          targetUrl: 'https://www.w3.org/TR/2020/REC-json-ld11-20200716/',
        },
        {
          key: 'RFC2119',
          nature: 'normative',
          targetUrl: 'https://www.rfc-editor.org/rfc/rfc2119',
        },
        {
          key: 'VC-DATA-MODEL',
          nature: 'informative',
          targetUrl: 'https://www.w3.org/TR/vc-data-model/',
        },
        {
          key: 'SELF',
          nature: 'normative',
          targetUrl: 'https://www.w3.org/TR/css-flexbox-1/',
        },
        {
          key: 'JSON-LD11-AGAIN',
          nature: 'normative',
          targetUrl: 'https://www.w3.org/TR/json-ld11/',
        },
        { key: 'NOLINK', nature: 'normative' },
      ],
      index,
    )

    expect(result.citations).toEqual([
      {
        source: 'https://www.w3.org/TR/css-flexbox-1/',
        target: 'https://www.w3.org/TR/json-ld11/',
        nature: 'normative',
        key: 'JSON-LD11',
      },
      {
        source: 'https://www.w3.org/TR/css-flexbox-1/',
        target: 'https://www.w3.org/TR/json-ld11/',
        nature: 'informative',
        key: 'DATED',
      },
    ])
    expect(result.nonW3c).toEqual([
      {
        key: 'RFC2119',
        url: 'https://www.rfc-editor.org/rfc/rfc2119',
      },
    ])
    expect(result.outOfCatalog).toEqual([
      {
        key: 'VC-DATA-MODEL',
        url: 'https://www.w3.org/TR/vc-data-model/',
      },
    ])
    expect(result.selfReferences).toEqual(['SELF'])
    expect(result.unresolved).toEqual([
      { key: 'NOLINK', reason: 'no link in entry' },
    ])
    expect(result.duplicates).toBe(1)
  })

  test('matches by shortname when the dated path uses an older shortname', () => {
    const result = resolveReferences(
      source,
      [
        {
          key: 'DID',
          nature: 'normative',
          targetUrl: 'https://www.w3.org/TR/2022/REC-did-core-20220719/',
        },
      ],
      index,
    )
    expect(result.citations[0]?.target).toBe(
      'https://www.w3.org/TR/did-core/',
    )
  })

  test('does not resolve an out-of-catalog version to a newer series', () => {
    const result = resolveReferences(
      source,
      [
        {
          key: 'VC-DATA-MODEL',
          nature: 'informative',
          targetUrl: 'https://www.w3.org/TR/2022/REC-vc-data-model-20220303/',
        },
      ],
      index,
    )
    // vc-data-model-2.0 is a different series from vc-data-model.
    expect(result.citations).toEqual([])
    expect(result.outOfCatalog).toHaveLength(1)
  })
})

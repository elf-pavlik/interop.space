import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import { extractDocument } from './extract.ts'

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

describe('extractDocument', () => {
  test('parses Bikeshed sections with optional closing dd tags', async () => {
    const result = extractDocument(await fixture('bikeshed.html'))

    expect(result.generator).toBe('bikeshed')
    expect(result.generatorVersion).toBe('3e9f1c2')
    expect(result.hasNormativeSection).toBe(true)
    expect(result.hasInformativeSection).toBe(true)
    expect(result.rawRespec).toBe(false)

    const normative = result.references.filter(
      (reference) => reference.nature === 'normative',
    )
    expect(normative.map((reference) => reference.key)).toEqual([
      'CSS-FLEXBOX-1',
      'DOM',
      'OLD',
      'NOLINK',
    ])
    expect(
      normative.find((reference) => reference.key === 'CSS-FLEXBOX-1')
        ?.targetUrl,
    ).toBe('https://www.w3.org/TR/css-flexbox-1/')
    expect(
      normative.find((reference) => reference.key === 'DOM')?.targetUrl,
    ).toBe('https://dom.spec.whatwg.org/')
    expect(
      normative.find((reference) => reference.key === 'NOLINK')?.targetUrl,
    ).toBeUndefined()

    const informative = result.references.filter(
      (reference) => reference.nature === 'informative',
    )
    expect(informative.map((reference) => reference.key)).toEqual([
      'JSON-LD11',
    ])
    expect(result.conflicts).toEqual(['CSS-FLEXBOX-1'])
  })

  test('parses ReSpec sections and visible keys', async () => {
    const result = extractDocument(await fixture('respec.html'))

    expect(result.generator).toBe('respec')
    expect(result.generatorVersion).toBe('32.1.10')
    expect(result.hasNormativeSection).toBe(true)
    expect(result.hasInformativeSection).toBe(true)
    expect(result.references.map((reference) => reference.key)).toEqual([
      'JSON-LD11',
      'RFC2119',
      'VC-DATA-MODEL',
    ])
    expect(
      result.references.find((reference) => reference.key === 'RFC2119')
        ?.targetUrl,
    ).toBe('https://www.rfc-editor.org/rfc/rfc2119')
    expect(result.conflicts).toEqual([])
  })

  test('recognizes raw ReSpec source without rendered sections', async () => {
    const result = extractDocument(await fixture('raw-respec.html'))

    expect(result.generator).toBe('unknown')
    expect(result.hasNormativeSection).toBe(false)
    expect(result.hasInformativeSection).toBe(false)
    expect(result.rawRespec).toBe(true)
    expect(result.references).toEqual([])
  })

  test('reports old HTML without references sections as unsupported', async () => {
    const result = extractDocument(await fixture('old.html'))

    expect(result.hasNormativeSection).toBe(false)
    expect(result.hasInformativeSection).toBe(false)
    expect(result.rawRespec).toBe(false)
    expect(result.references).toEqual([])
  })
})

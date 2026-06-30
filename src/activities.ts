import { readFile } from 'node:fs/promises'
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint'
import * as jsonld from 'jsonld'

export async function seedData(): Promise<string> {
  const datasetPath = process.env.DATASET_PATH
  const endpoint = process.env.SPARQL_ENDPOINT

  if (!datasetPath) {
    throw new Error('DATASET_PATH environment variable is not set')
  }
  if (!endpoint) {
    throw new Error('SPARQL_ENDPOINT environment variable is not set')
  }

  const data = await readFile(datasetPath, 'utf-8')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/n-quads',
    },
    body: data,
  })

  if (!response.ok) {
    throw new Error(`Failed to ingest data to ${endpoint}: ${response.statusText}`)
  }

  return 'Data seeded successfully'
}

export async function greet(id: string): Promise<string> {
  const endpoint = process.env.SPARQL_ENDPOINT
  if (!endpoint) {
    throw new Error('SPARQL_ENDPOINT environment variable is not set')
  }

  const query = `SELECT ?name WHERE { <${id}> <https://www.w3.org/ns/activitystreams#name> ?name }`
  const fetcher = new SparqlEndpointFetcher()
  const bindings = await fetcher.fetchBindings(endpoint, query)

  const results: Array<{ name: string }> = []
  for await (const binding of bindings) {
    results.push({ name: binding.name.value })
  }

  const name = results[0]?.name ?? 'Unknown'
  return `Hello, ${name}!`
}

export async function addAccount(): Promise<string> {
  const endpoint = process.env.SPARQL_ENDPOINT
  if (!endpoint) {
    throw new Error('SPARQL_ENDPOINT environment variable is not set')
  }

  const update = `INSERT DATA { <https://elf-pavlik.hackers4peace.net> <https://ns.example/fediverseAccount> <acct:elfpavlik@w3c.social> }`
  const fetcher = new SparqlEndpointFetcher()
  await fetcher.fetchUpdate(endpoint, update)

  return 'Account data added successfully'
}

export async function dumpData(): Promise<string> {
  const endpoint = process.env.SPARQL_ENDPOINT
  if (!endpoint) {
    throw new Error('SPARQL_ENDPOINT environment variable is not set')
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/n-quads',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to dump data from ${endpoint}: ${response.statusText}`)
  }

  const nquads = await response.text()
  const doc = await jsonld.fromRDF(nquads, { format: 'application/n-quads' })
  const canonized = await jsonld.canonize(doc, {
    algorithm: 'URDNA2015',
    format: 'application/n-quads'
  })

  return canonized
}

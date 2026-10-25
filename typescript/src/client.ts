import { Client, Connection } from '@temporalio/client'

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await Connection.connect({ address })

  const client = new Client({ connection, namespace: 'default' })

  //   const handle = await client.workflow.execute('greetingWorkflow', {
  //     taskQueue: 'greeting',
  //     args: [ID],
  //     workflowId: `hello-world-${Date.now()}`,
  //   })
  //
  //   const fediverse = await client.workflow.execute('FediverseWorkflow', {
  //     taskQueue: 'fediverse',
  //     args: ['elfpavlik@w3c.social'],
  //     workflowId: `fediverse-${Date.now()}`,
  //   })

  //   const catalog = await client.workflow.execute('catalogDependencyWorkflow', {
  //     taskQueue: 'catalog',
  //     workflowId: `catalog-deps-${Date.now()}`,
  //     workflowExecutionTimeout: '15 minutes',
  //   })

  // For now the dump is grown from the previous dump (or the fallback
  // elf-pavlik GitHub account when there is none). With upstream data treated
  // as frozen, people already linked to a W3C group, groups already present
  // and groups with specs are skipped; only missing groups, participants and
  // specifications are fetched from api.w3.org.
  const w3c = await client.workflow.execute('w3cApiWorkflow', {
    taskQueue: 'w3c',
    workflowId: `w3c-api-${Date.now()}`,
    workflowExecutionTimeout: '15 minutes',
  })

  console.log('w3c api workflow result:', JSON.stringify(w3c))
}

run().catch((err) => {
  console.error('Client failed:', err)
  process.exit(1)
})
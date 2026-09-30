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

  const catalog = await client.workflow.execute('catalogDependencyWorkflow', {
    taskQueue: 'catalog',
    workflowId: `catalog-deps-${Date.now()}`,
    workflowExecutionTimeout: '15 minutes',
  })

  console.log('catalog dependency workflow result:', JSON.stringify(catalog))
}

run().catch((err) => {
  console.error('Client failed:', err)
  process.exit(1)
})
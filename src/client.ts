import { Client, Connection } from '@temporalio/client'

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await Connection.connect({ address })

  const client = new Client({ connection, namespace: 'default' })

  const handle = await client.workflow.start('greetingWorkflow', {
    taskQueue: 'greeting',
    args: ['World'],
    workflowId: `hello-world-${Date.now()}`,
  })

  const fediverse = await client.workflow.start('fediverseProfile', {
    taskQueue: 'fediverse',
    args: ['elfpavlik@w3c.social'],
    workflowId: `fediverse-${Date.now()}`,
  })
}

run().catch((err) => {
  console.error('Client failed:', err)
  process.exit(1)
})

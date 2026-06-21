import { setTimeout as sleep } from 'node:timers/promises'
import { Worker, NativeConnection } from '@temporalio/worker'
import * as activities from './activities'
import * as fediverseActivities from './protocols/fediverse/activities'

async function connectWithRetry(address) {
  while (true) {
    try {
      return await NativeConnection.connect({
        address
      })
    } catch (err) {
      console.error('Temporal not ready, retrying...', err.message)
      await sleep(500)
    }
  }
}

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await connectWithRetry(address)

  try {
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'greeting',
      workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
      activities,
    })

    const fediverse = await Worker.create({
      connection,
      taskQueue: 'fediverse',
      workflowsPath: new URL('../src/protocols/fediverse/workflows.ts', import.meta.url).pathname,
      activities: fediverseActivities,
    })

    // Run all workers simultaneously
    await Promise.all([worker.run(), fediverse.run()])
  } finally {
    await connection.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

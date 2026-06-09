import { Worker, NativeConnection } from '@temporalio/worker'
import * as activities from './activities'

async function run() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233'
  const connection = await NativeConnection.connect({ address })

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'greeting',
    workflowsPath: new URL('./workflows.ts', import.meta.url).pathname,
    activities,
  })

  console.log(`Worker connected to ${address}, listening on task queue: greeting`)
  await worker.run()
}

run().catch((err) => {
  console.error('Worker failed:', err)
  process.exit(1)
})

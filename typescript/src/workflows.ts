import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { seedData, greet, addAccount, dumpData } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function greetingWorkflow(id: string): Promise<string> {
  await seedData()
  const result = await greet(id)
  await addAccount()
  await dumpData()
  return result
}

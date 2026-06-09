import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { greet } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function greetingWorkflow(name: string): Promise<string> {
  return await greet(name)
}

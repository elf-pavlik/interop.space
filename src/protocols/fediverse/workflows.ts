import { proxyActivities } from '@temporalio/workflow'
import { Profile } from '../../types/profile'
import type * as activities from './activities'

const { getProfile, doWebfinger } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function fediverseProfile(id: string): Promise<Profile> {
  const jrd = await doWebfinger(id)
  return getProfile(jrd.links.find(l => l.rel === 'self')!.href)
}

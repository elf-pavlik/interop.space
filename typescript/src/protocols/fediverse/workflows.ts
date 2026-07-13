import { proxyActivities } from '@temporalio/workflow'
import type { Profile } from '../../types'
import type * as activities from './activities'

const { getProfile, doWebfinger } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function fediverseProfile(id: string): Promise<Profile> {
  const jrd = await doWebfinger(id)
  return getProfile(jrd.links.find((l: { rel: string; href: string }) => l.rel === 'self')!.href)
}

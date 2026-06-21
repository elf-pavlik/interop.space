import { Profile } from "../../types/profile";

export async function doWebfinger(id: string): Promise<any> {
  const [handle, domain] = id.split('@')
  const url = `https://${domain}/.well-known/webfinger?resource=acct:${handle}@${domain}`
  const response = await fetch(url)
  return await response.json()
}

export async function getProfile(id: string): Promise<Profile> {
  const response = await fetch(id, {
    headers: {
      accept: 'application/activity+json'
    }
  })
  return await response.json()
}

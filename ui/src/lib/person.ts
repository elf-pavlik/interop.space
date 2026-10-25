import type { Person, W3cParticipant } from '../worker/protocol'

// Tail of a catalog URI, mirroring the worker's `short()` helper, so a group
// participant resolves to the same /people/:id page as the People directory.
export const shortUri = (uri: string) =>
  uri.replace(/^.*[/#]/, '').replace(/^urn:uuid:/, '')

// Group participants are ex:Person nodes too; the participant view only lists
// the fields needed by PersonCard.
export const personFromParticipant = (
  participant: W3cParticipant,
): Person => ({
  id: shortUri(participant.uri),
  uri: participant.uri,
  name: participant.name,
  avatarUrl: participant.avatarUrl,
  github: participant.github,
  w3cId: participant.w3cId,
})

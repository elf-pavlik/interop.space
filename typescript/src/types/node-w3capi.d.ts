// Minimal types for node-w3capi, which ships no declarations.
declare module 'node-w3capi' {
  export type W3cApiLink = {
    href: string
  }

  /** A group user with `embed`; link-only lists only carry href/title. */
  export type W3cApiGroupUser = W3cApiUserDetail & {
    href?: string
    title?: string
    former?: boolean
  }

  export type W3cApiPhoto = {
    href: string
    name: string
  }

  export type W3cApiConnectedAccount = {
    service: string
    identifier: string
    nickname: string
    href?: string
    'profile-picture'?: string
  }

  /** A group as returned by a list endpoint (with or without `embed`). */
  export type W3cApiGroupDetail = {
    id: number
    name: string
    shortname?: string
    type?: string
    _links?: {
      self?: W3cApiLink
      homepage?: W3cApiLink
      users?: W3cApiLink
    }
  }

  export type W3cApiUserDetail = {
    id: number
    name: string
    'connected-accounts'?: W3cApiConnectedAccount[]
    _links?: {
      self?: W3cApiLink
      photos?: W3cApiPhoto[]
      groups?: W3cApiLink
    }
  }

  export type W3cApiSpecification = {
    title: string
    shortname?: string
    shortlink?: string
    description?: string
    'editor-draft'?: string
    _links?: {
      self?: W3cApiLink
    }
  }

  export type W3cApiList<T> = {
    fetch(options?: { embed?: boolean }): Promise<T[]>
  }

  export type W3cApiItem<T> = {
    fetch(): Promise<T>
  }

  export type W3cApiUser = W3cApiItem<W3cApiUserDetail> & {
    groups(): W3cApiList<W3cApiGroupDetail>
  }

  export type W3cApiGroup = {
    users(): W3cApiList<W3cApiGroupUser>
  }

  const w3capi: {
    group(id: number | string): W3cApiGroup
    user(id: string | { type: string; id: string }): W3cApiUser
  }

  export default w3capi
}

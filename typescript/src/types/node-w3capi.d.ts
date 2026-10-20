// Minimal types for node-w3capi, which ships no declarations.
declare module 'node-w3capi' {
  export type W3cApiUser = {
    href: string
    title: string
    former: boolean
  }

  export type W3cApiPhoto = {
    href: string
    name: string
  }

  export type W3cApiUserDetail = {
    id: number
    name: string
    _links?: { photos?: W3cApiPhoto[] }
  }

  export type W3cApiList<T> = {
    fetch(options?: { embed?: boolean }): Promise<T[]>
  }

  export type W3cApiItem<T> = {
    fetch(): Promise<T>
  }

  export type W3cApiGroup = {
    users(): W3cApiList<W3cApiUser>
  }

  const w3capi: {
    group(id: number | string): W3cApiGroup
    user(id: string | { type: string; id: string }): W3cApiItem<W3cApiUserDetail>
  }

  export default w3capi
}

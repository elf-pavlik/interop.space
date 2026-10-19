// Minimal types for the browserify bundle shipped in node-w3capi's lib/.
// The package has no type declarations; the browser entry is documented in its
// README as the client-side module.
declare module 'node-w3capi/lib/w3capi.js' {
  export type W3cApiUser = {
    href: string
    title: string
    former: boolean
  }

  export type W3cApiList<T> = {
    fetch(options?: { embed?: boolean }): Promise<T[]>
  }

  export type W3cApiGroup = {
    users(): W3cApiList<W3cApiUser>
  }

  const w3capi: {
    group(id: number | string): W3cApiGroup
  }

  export default w3capi
}

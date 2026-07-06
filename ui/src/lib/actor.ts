import { createStore, reconcile, type Store } from 'solid-js/store'

export type ActorHandle<Cmd> = {
  send: (cmd: Cmd) => void
  stop: () => void
}

// A slice patch: a key of State paired with that slice's next value.
type SlicePatch<State> = {
  [K in keyof State]: { key: K; value: State[K] }
}[keyof State]

// Bridges a worker "actor" (owns state, emits one slice patch at a time) into a
// Solid store. Each patch reconciles only its slice, keyed by `id`.
export function createActorStore<State extends object, Cmd>(
  worker: Worker,
  initial: State,
): [Store<State>, ActorHandle<Cmd>] {
  const [state, setState] = createStore<State>(initial)
  worker.onmessage = (e: MessageEvent<SlicePatch<State>>) => {
    const { key, value } = e.data
    // Sound: SlicePatch ties key <-> value; Solid's dynamic setState needs a cast.
    setState(key as never, reconcile(value) as never)
  }
  return [
    state,
    { send: (cmd) => worker.postMessage(cmd), stop: () => worker.terminate() },
  ]
}

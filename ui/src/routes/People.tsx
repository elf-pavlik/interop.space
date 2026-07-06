import type { Component } from 'solid-js'
import { For, Match, Switch, onMount } from 'solid-js'
import { PersonCard } from '../components/PersonCard'
import { appActor } from '../store/app'
import { peopleSlice } from '../store/selectors'

const People: Component = () => {
  onMount(() => {
    if (peopleSlice().status === 'idle') appActor.send({ type: 'loadPeople' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">People</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {peopleSlice().data.length} people in the directory.
        </p>
      </div>
      <Switch>
        <Match when={peopleSlice().status === 'error'}>
          <p class="text-red-500">Failed to load people: {peopleSlice().error}</p>
        </Match>
        <Match when={peopleSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">Loading people…</p>
        </Match>
        <Match when={peopleSlice().status === 'ready'}>
          <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={peopleSlice().data}>
              {(person) => <PersonCard person={person} />}
            </For>
          </ul>
        </Match>
      </Switch>
    </section>
  )
}

export default People

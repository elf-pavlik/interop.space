import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { SpecificationCard } from '../components/SpecificationCard'
import { appActor } from '../store/app'
import { specificationsSlice } from '../store/selectors'

const Specifications: Component = () => {
  onMount(() => {
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Specifications</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {specificationsSlice().data.length} specifications delivered by W3C
          groups.
        </p>
      </div>
      <Switch>
        <Match when={specificationsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load specifications: {specificationsSlice().error}
          </p>
        </Match>
        <Match when={specificationsSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading specifications…
          </p>
        </Match>
        <Match when={specificationsSlice().status === 'ready'}>
          <Show
            when={specificationsSlice().data.length > 0}
            fallback={
              <p class="text-slate-500 dark:text-slate-400">
                No specifications found in the catalog.
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <For each={specificationsSlice().data}>
                {(spec) => (
                  <li>
                    <SpecificationCard spec={spec} showGroups />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

export default Specifications

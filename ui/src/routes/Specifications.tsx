import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
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
                  <li class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div class="space-y-1">
                      <Show
                        when={spec.landingPage}
                        fallback={
                          <p class="text-lg font-semibold">{spec.name}</p>
                        }
                      >
                        {(href) => (
                          <a
                            href={href()}
                            target="_blank"
                            rel="noreferrer"
                            class="text-lg font-semibold hover:underline"
                          >
                            {spec.name}
                          </a>
                        )}
                      </Show>
                      <Show when={spec.shortname}>
                        <p class="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {spec.shortname}
                        </p>
                      </Show>
                    </div>

                    <Show when={spec.groups.length > 0}>
                      <div class="space-y-1">
                        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Delivered by
                        </p>
                        <ul class="flex flex-wrap gap-2">
                          <For each={spec.groups}>
                            {(group) => (
                              <li class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {group}
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </Show>

                    <Show when={spec.editorDraft}>
                      {(href) => (
                        <a
                          href={href()}
                          target="_blank"
                          rel="noreferrer"
                          class="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          Editor's draft →
                        </a>
                      )}
                    </Show>
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

import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A, useParams } from '@solidjs/router'
import { appActor } from '../store/app'
import {
  groupByName,
  specificationById,
  specificationsSlice,
  w3cGroupsSlice,
} from '../store/selectors'

const metaLink =
  'rounded-md border border-slate-200 px-2.5 py-1 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800'

const SpecificationDetail: Component = () => {
  const params = useParams<{ id: string }>()

  onMount(() => {
    if (specificationsSlice().status === 'idle')
      appActor.send({ type: 'loadSpecifications' })
    // Only needed to turn the "Delivered by" names into links.
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
  })

  const spec = () => specificationById(params.id)

  return (
    <section class="space-y-6">
      <A
        href="/specifications"
        class="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        ← All specifications
      </A>
      <Switch>
        <Match when={specificationsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load specifications: {specificationsSlice().error}
          </p>
        </Match>
        <Match when={!spec() && specificationsSlice().status !== 'ready'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading specification…
          </p>
        </Match>
        <Match when={spec()}>
          {(s) => (
            <>
              <div class="space-y-2">
                <h1 class="text-3xl font-bold tracking-tight">{s().name}</h1>
                <Show when={s().shortname}>
                  <p class="font-mono text-sm text-slate-500 dark:text-slate-400">
                    {s().shortname}
                  </p>
                </Show>
                <Show when={s().landingPage || s().editorDraft}>
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Show when={s().landingPage}>
                      {(href) => (
                        <a
                          href={href()}
                          target="_blank"
                          rel="noreferrer"
                          title="Latest published version (TR)"
                          class={metaLink}
                        >
                          TR
                        </a>
                      )}
                    </Show>
                    <Show when={s().editorDraft}>
                      {(href) => (
                        <a
                          href={href()}
                          target="_blank"
                          rel="noreferrer"
                          title="Editor's draft (ED)"
                          class={metaLink}
                        >
                          ED
                        </a>
                      )}
                    </Show>
                  </div>
                </Show>
              </div>

              <div class="space-y-3">
                <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Delivered by
                </h2>
                <Show
                  when={s().groups.length > 0}
                  fallback={
                    <p class="text-slate-500 dark:text-slate-400">
                      No group is linked to this specification in the catalog.
                    </p>
                  }
                >
                  <ul class="flex flex-wrap gap-2">
                    <For each={s().groups}>
                      {(name) => (
                        <li>
                          <Show
                            when={groupByName(name)}
                            fallback={
                              <span class="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {name}
                              </span>
                            }
                          >
                            {(group) => (
                              <A
                                href={`/groups/${group().id}`}
                                class="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                {name}
                              </A>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </>
          )}
        </Match>
        <Match when={!spec()}>
          <p class="text-slate-500 dark:text-slate-400">
            Specification not found.
          </p>
        </Match>
      </Switch>
    </section>
  )
}

export default SpecificationDetail

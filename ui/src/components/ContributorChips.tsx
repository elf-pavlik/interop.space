import type { Component } from 'solid-js'
import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import type { SpecContributor } from '../worker/protocol'

const base =
  'rounded-full bg-slate-100 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200'
const link =
  'transition hover:bg-slate-200 dark:hover:bg-slate-700'

export const ContributorChips: Component<{
  people: SpecContributor[]
  size?: 'sm' | 'md'
  class?: string
}> = (props) => {
  const sizeClass = () =>
    props.size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <ul class={`flex flex-wrap gap-2 ${props.class ?? ''}`}>
      <For each={props.people}>
        {(person) => (
          <li>
            <Show
              when={person.id}
              fallback={
                <span class={`${base} ${sizeClass()}`}>{person.name}</span>
              }
            >
              {(id) => (
                <A
                  href={`/people/${id()}`}
                  class={`${base} ${sizeClass()} ${link}`}
                >
                  {person.name}
                </A>
              )}
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

export const ContributorSection: Component<{
  title: string
  people: SpecContributor[]
  empty: string
}> = (props) => (
  <div class="space-y-3">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {props.title}
    </h2>
    <Show
      when={props.people.length > 0}
      fallback={
        <p class="text-slate-500 dark:text-slate-400">{props.empty}</p>
      }
    >
      <ContributorChips people={props.people} size="md" />
    </Show>
  </div>
)

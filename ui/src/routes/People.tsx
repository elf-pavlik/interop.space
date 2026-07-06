import type { Component } from 'solid-js'
import { For } from 'solid-js'
import { Avatar } from '../components/ui/avatar'
import { people } from '../data/people'

const People: Component = () => {
  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">People</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {people.length} people in the directory.
        </p>
      </div>
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={people}>
          {(person) => (
            <li class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <Avatar src={person.avatarUrl} name={person.name} />
              <div>
                <p class="font-semibold">{person.name}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {person.id}
                </p>
              </div>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

export default People

import type { Component } from 'solid-js'
import { For, Match, Show, Switch, onMount } from 'solid-js'
import { A } from '@solidjs/router'
import { Avatar } from '../components/ui/avatar'
import { appActor } from '../store/app'
import { membersOf, peopleSlice, projectsSlice } from '../store/selectors'

const Projects: Component = () => {
  onMount(() => {
    if (projectsSlice().status === 'idle')
      appActor.send({ type: 'loadProjects' })
    // The cards show member avatars, so we need the people slice too.
    if (peopleSlice().status === 'idle') appActor.send({ type: 'loadPeople' })
  })

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
        <p class="text-slate-600 dark:text-slate-400">
          {projectsSlice().data.length} projects.
        </p>
      </div>
      <Switch>
        <Match when={projectsSlice().status === 'error'}>
          <p class="text-red-500">
            Failed to load projects: {projectsSlice().error}
          </p>
        </Match>
        <Match when={projectsSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">Loading projects…</p>
        </Match>
        <Match when={projectsSlice().status === 'ready'}>
          <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <For each={projectsSlice().data}>
              {(project) => (
                <li>
                  <A
                    href={`/projects/${project.id}`}
                    class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div class="space-y-1">
                      <p class="text-lg font-semibold">{project.name}</p>
                      <p class="text-sm text-slate-500 dark:text-slate-400">
                        {project.description}
                      </p>
                    </div>
                    <Show
                      when={membersOf(project.id).length > 0}
                      fallback={
                        <p class="text-xs text-slate-400">
                          {project.memberIds.length} members
                        </p>
                      }
                    >
                      <div class="flex -space-x-3">
                        <For each={membersOf(project.id)}>
                          {(person) => (
                            <div class="ring-2 ring-white dark:ring-slate-900 rounded-full">
                              <Avatar
                                src={person.avatarUrl}
                                name={person.name}
                              />
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
    </section>
  )
}

export default Projects

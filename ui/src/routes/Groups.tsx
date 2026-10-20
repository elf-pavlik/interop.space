import type { Component } from 'solid-js'
import { For, Show, onMount } from 'solid-js'
import { Avatar } from '../components/ui/avatar'
import { appActor } from '../store/app'
import { w3cGroupsSlice } from '../store/selectors'
import type { W3cGroup, W3cParticipant } from '../worker/protocol'

const GroupCard: Component<{ group: W3cGroup; selected: boolean }> = (
  props,
) => (
  <label
    class={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-5 shadow-sm transition dark:bg-slate-900 ${props.selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:shadow-md dark:border-slate-800'}`}
  >
    <input
      type="checkbox"
      class="mt-1 h-4 w-4 accent-indigo-600"
      checked={props.selected}
      onChange={() =>
        appActor.send({ type: 'toggleW3cGroup', id: props.group.id })
      }
    />
    <span class="space-y-1">
      <span class="block font-semibold">{props.group.name}</span>
      <span class="block text-sm text-slate-500 dark:text-slate-400">
        W3C group {props.group.id} · {props.group.participants.length}
        {props.group.participants.length === 1 ? ' participant' : ' participants'}
      </span>
    </span>
  </label>
)

const ParticipantList: Component<{
  title: string
  note: string
  people: W3cParticipant[]
}> = (props) => (
  <div class="space-y-3">
    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.title}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">{props.note}</p>
    </div>
    <Show
      when={props.people.length > 0}
      fallback={
        <p class="text-slate-500 dark:text-slate-400">No participants.</p>
      }
    >
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={props.people}>
          {(person) => (
            <li class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Avatar src={person.avatarUrl} name={person.name} />
              <p class="font-semibold">{person.name}</p>
            </li>
          )}
        </For>
      </ul>
    </Show>
  </div>
)

const Groups: Component = () => {
  onMount(() => {
    if (w3cGroupsSlice().status === 'idle')
      appActor.send({ type: 'loadW3cGroups' })
  })

  const groups = () => w3cGroupsSlice().data.groups
  const selectedGroups = () =>
    groups().filter((g) => w3cGroupsSlice().data.selected.includes(g.id))
  const singleGroup = () =>
    selectedGroups().length === 1 ? selectedGroups()[0] : undefined
  const groupsFallback = () => {
    const status = w3cGroupsSlice().status
    if (status === 'error') return 'Could not load groups from the catalog.'
    if (status === 'ready') return 'No W3C groups found in the catalog.'
    return 'Loading groups from the catalog…'
  }
  const countNote = () => {
    const chosen = selectedGroups()
    if (chosen.length < 2) return ''
    return `${chosen.map((g) => `${g.participants.length} in ${g.name}`).join(' · ')}; ${w3cGroupsSlice().data.common.length} in all of them.`
  }

  return (
    <section class="space-y-6">
      <div class="space-y-1">
        <h1 class="text-3xl font-bold tracking-tight">W3C Groups</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Select the groups you want to compare. Participants are synced from
          the W3C API into the catalog; with more than one group selected,
          the list shows who they have in common.
        </p>
      </div>

      <Show when={w3cGroupsSlice().status === 'error'}>
        <p class="text-red-500">
          Failed to load W3C groups: {w3cGroupsSlice().error}
        </p>
      </Show>

      <Show
        when={groups().length > 0}
        fallback={
          <p class="text-slate-500 dark:text-slate-400">{groupsFallback()}</p>
        }
      >
        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <For each={groups()}>
            {(group) => (
              <li>
                <GroupCard
                  group={group}
                  selected={w3cGroupsSlice().data.selected.includes(group.id)}
                />
              </li>
            )}
          </For>
        </ul>

        <Show when={w3cGroupsSlice().status === 'loading'}>
          <p class="text-slate-500 dark:text-slate-400">
            Loading groups and participants from the catalog…
          </p>
        </Show>

        <Show when={selectedGroups().length === 0}>
          <p class="text-slate-500 dark:text-slate-400">
            Select at least one group above.
          </p>
        </Show>

        <Show when={singleGroup()}>
          {(group) => (
            <ParticipantList
              title={`Participants of ${group().name}`}
              note={`${group().participants.length} ${group().participants.length === 1 ? 'participant' : 'participants'} in the catalog. Select another group to see who they have in common.`}
              people={group().participants}
            />
          )}
        </Show>

        <Show when={selectedGroups().length > 1}>
          <ParticipantList
            title={`Common participants (${w3cGroupsSlice().data.common.length})`}
            note={countNote()}
            people={w3cGroupsSlice().data.common}
          />
        </Show>
      </Show>
    </section>
  )
}

export default Groups

import type { Component } from 'solid-js'
import { Avatar } from './ui/avatar'
import type { Person } from '../worker/protocol'

export const PersonCard: Component<{ person: Person }> = (props) => {
  return (
    <li class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <Avatar src={props.person.avatarUrl} name={props.person.name} />
      <div>
        <p class="font-semibold">{props.person.name}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {props.person.handle ?? props.person.id}
        </p>
      </div>
    </li>
  )
}

import { Avatar as ArkAvatar } from '@ark-ui/solid/avatar'
import type { Component } from 'solid-js'

type AvatarProps = {
  src: string
  name: string
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

// TarkUI-style Avatar built on Ark UI (@ark-ui/solid), styled with Tailwind.
export const Avatar: Component<AvatarProps> = (props) => {
  return (
    <ArkAvatar.Root class="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <ArkAvatar.Fallback class="text-sm font-semibold text-slate-500 dark:text-slate-400">
        {initials(props.name)}
      </ArkAvatar.Fallback>
      <ArkAvatar.Image
        src={props.src}
        alt={props.name}
        class="h-full w-full object-cover"
      />
    </ArkAvatar.Root>
  )
}

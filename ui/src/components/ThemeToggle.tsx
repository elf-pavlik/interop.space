import type { Component } from 'solid-js'
import { Match, Switch } from 'solid-js'
import { Monitor, Moon, Sun } from 'lucide-solid'
import { cycleTheme, theme } from '../lib/theme'

const label: Record<ReturnType<typeof theme>, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

export const ThemeToggle: Component = () => {
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={label[theme()]}
      title={label[theme()]}
      class="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      <Switch>
        <Match when={theme() === 'system'}>
          <Monitor size={18} />
        </Match>
        <Match when={theme() === 'light'}>
          <Sun size={18} />
        </Match>
        <Match when={theme() === 'dark'}>
          <Moon size={18} />
        </Match>
      </Switch>
    </button>
  )
}

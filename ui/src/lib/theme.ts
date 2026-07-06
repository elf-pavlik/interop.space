import { createSignal } from 'solid-js'

export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

const readStored = (): Theme => {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

const resolveDark = (theme: Theme) =>
  theme === 'dark' || (theme === 'system' && media.matches)

const apply = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', resolveDark(theme))
}

const [theme, setThemeSignal] = createSignal<Theme>(readStored())

export { theme }

export const isDark = () => resolveDark(theme())

export const setTheme = (next: Theme) => {
  if (next === 'system') localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, next)
  setThemeSignal(next)
  apply(next)
}

// Cycle System → Light → Dark → System.
export const cycleTheme = () => {
  const order: Theme[] = ['system', 'light', 'dark']
  setTheme(order[(order.indexOf(theme()) + 1) % order.length])
}

// Keep in sync with the OS while in `system` mode.
media.addEventListener('change', () => {
  if (theme() === 'system') apply('system')
})

// Apply once on load (the inline script in index.html handles the pre-paint
// flash; this reconciles after hydration).
apply(theme())

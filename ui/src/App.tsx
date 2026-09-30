import type { ParentComponent } from 'solid-js'
import type { RouteDefinition } from '@solidjs/router'
import { A } from '@solidjs/router'
import Home from './routes/Home'
import People from './routes/People'
import Projects from './routes/Projects'
import ProjectDetail from './routes/ProjectDetail'
import Software from './routes/Software'
import { ThemeToggle } from './components/ThemeToggle'

export const routes: RouteDefinition[] = [
  { path: '/', component: Home },
  { path: '/people', component: People },
  { path: '/projects', component: Projects },
  { path: '/projects/:id', component: ProjectDetail },
  { path: '/software', component: Software },
]

const navLink =
  'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'

const App: ParentComponent = (props) => {
  return (
    <div class="min-h-screen">
      <header class="border-b border-slate-200 dark:border-slate-800">
        <nav class="mx-auto flex max-w-4xl items-center gap-2 px-6 py-4">
          <A href="/" class="mr-auto text-lg font-semibold tracking-tight">
            interop<span class="text-indigo-500">.space</span>
          </A>
          <A href="/" end class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Home
          </A>
          <A href="/people" class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            People
          </A>
          <A href="/projects" class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Projects
          </A>
          <A href="/software" class={navLink} activeClass="bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
            Software
          </A>
          <ThemeToggle />
        </nav>
      </header>
      <main class="mx-auto max-w-4xl px-6 py-10">{props.children}</main>
    </div>
  )
}

export default App

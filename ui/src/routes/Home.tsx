import type { Component } from 'solid-js'
import { A } from '@solidjs/router'

const Home: Component = () => {
  return (
    <section class="flex flex-col items-start gap-6">
      <div class="space-y-3">
        <h1 class="text-4xl font-bold tracking-tight">Welcome to interop.space</h1>
        <p class="max-w-prose text-slate-600 dark:text-slate-400">
          A minimal Solid.js frontend scaffolded with Vite, Bun, and TarkUI
          components. This is the starting point — explore the people directory
          below.
        </p>
      </div>
      <A
        href="/people"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
      >
        View people →
      </A>
    </section>
  )
}

export default Home

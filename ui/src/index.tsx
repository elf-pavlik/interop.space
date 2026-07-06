/* @refresh reload */
import { render } from 'solid-js/web'
import { Router } from '@solidjs/router'
import App, { routes } from './App'
import './app.css'

const root = document.getElementById('root')

render(() => <Router root={App}>{routes}</Router>, root!)

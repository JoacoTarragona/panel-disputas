import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PanelApp } from './app/PanelApp'
import './styles/panel.css'

const root = document.getElementById('root')
if (!root) throw new Error('falta el root')

if (window.location.pathname === '/') {
  window.history.replaceState(null, '', '/operaciones')
}

createRoot(root).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
)

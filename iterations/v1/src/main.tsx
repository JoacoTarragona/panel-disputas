import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DisputasRoute } from './routes/disputas'

const root = document.getElementById('root')
if (!root) throw new Error('falta el root')

if (window.location.pathname !== '/disputas') {
  window.history.replaceState(null, '', '/disputas')
}

createRoot(root).render(
  <StrictMode>
    <DisputasRoute />
  </StrictMode>,
)

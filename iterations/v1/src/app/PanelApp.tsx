import { useEffect, useState } from 'react'
import { PanelLogin } from './PanelLogin'
import { OperationsView } from '../modules/operations-view/OperationsView'
import { StatisticsView } from '../modules/statistics-view/StatisticsView'
import { CaptureView } from '../modules/capture-view/CaptureView'
import { CredentialsView } from '../modules/credentials-view/CredentialsView'
import { DisputesView } from '../modules/disputes-view/DisputesView'
import { api } from '../lib/api'

function route(): string {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/operaciones') return 'operaciones'
  if (path === '/estadisticas') return 'estadisticas'
  if (path === '/disputas') return 'disputas'
  if (path === '/captura') return 'captura'
  if (path === '/credenciales') return 'credenciales'
  return 'operaciones'
}

export function PanelApp() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [checking, setChecking] = useState(true)
  const [view, setView] = useState(route)

  useEffect(() => {
    void (async () => {
      const response = await api('/api/me')
      setLoggedIn(response.ok)
      setChecking(false)
    })()
    const onNav = () => setView(route())
    window.addEventListener('popstate', onNav)
    return () => window.removeEventListener('popstate', onNav)
  }, [])

  if (checking) return null
  if (!loggedIn) {
    return <PanelLogin onOk={() => setLoggedIn(true)} />
  }
  if (view === 'estadisticas') return <StatisticsView />
  if (view === 'disputas') return <DisputesView embedded />
  if (view === 'captura') return <CaptureView />
  if (view === 'credenciales') return <CredentialsView />
  return <OperationsView />
}

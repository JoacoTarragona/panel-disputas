import type { ReactNode } from 'react'
import { PanelNav, type PanelTab } from './PanelNav'

type Props = {
  tab: PanelTab
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function PanelShell({ tab, title, subtitle, actions, children }: Props) {
  return (
    <>
      <header className="panel-header">
        <PanelNav active={tab} />
        <h1>{title}</h1>
        {actions}
      </header>
      <main className="panel-main">
        {subtitle && <p className="sub">{subtitle}</p>}
        {children}
      </main>
    </>
  )
}

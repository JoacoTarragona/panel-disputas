import { useEffect, useRef, useState } from 'react'

export type PanelTab = 'operaciones' | 'estadisticas' | 'disputas' | 'captura' | 'credenciales'

const LINKS: { id: PanelTab; href: string; label: string }[] = [
  { id: 'operaciones', href: '/operaciones', label: 'Operaciones' },
  { id: 'estadisticas', href: '/estadisticas', label: 'Motivos y estadísticas' },
  { id: 'disputas', href: '/disputas', label: 'Disputas' },
  { id: 'captura', href: '/captura', label: 'Captura' },
  { id: 'credenciales', href: '/credenciales', label: 'Credenciales' },
]

type Props = {
  active: PanelTab
}

export function PanelNav({ active }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="module-menu" ref={wrap}>
      <button type="button" className="btn-secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        ☰ Módulos
      </button>
      {open && (
        <ul className="module-menu-panel" role="menu">
          {LINKS.map((link) => (
            <li key={link.id} role="none">
              <a role="menuitem" href={link.href} className={link.id === active ? 'on' : ''} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

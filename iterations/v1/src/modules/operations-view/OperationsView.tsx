import { useEffect, useState } from 'react'
import { PanelShell } from '../../app/PanelShell'
import { api } from '../../lib/api'

type Agregador = 'uber' | 'pedidosya' | 'rappi'

type Local = {
  store_id: string
  name: string
  kind: string
  raw_state: string
  reason: string
  author: string
}

type SoldoutRow = { store: string; item: string; until: string }

type SoldoutState = { loading?: boolean; items?: SoldoutRow[]; error?: string }

const KIND_LABEL: Record<string, string> = {
  open: 'Abierto',
  paused: 'En pausa',
  closed: 'Cerrado en horario',
  offhours: 'Fuera de horario',
}

const KIND_CLASS: Record<string, string> = {
  open: 'st-open',
  paused: 'st-paused',
  closed: 'st-closed',
  offhours: 'st-offhours',
}

const KIND_ORDER = ['open', 'paused', 'closed', 'offhours'] as const

export function OperationsView() {
  const [agregador, setAgregador] = useState<Agregador>('uber')
  const [locales, setLocales] = useState<Local[]>([])
  const [disponibilidad, setDisponibilidad] = useState<number | null>(null)
  const [muestras, setMuestras] = useState(0)
  const [stamp, setStamp] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [expandedKind, setExpandedKind] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [soldoutByStore, setSoldoutByStore] = useState<Record<string, SoldoutState>>({})

  const aggDisabled = agregador === 'rappi'

  async function refresh() {
    setBusy(true)
    setNotice('')
    try {
      const response = await api('/api/operaciones/estado/actualizar', { agregador })
      const body = await response.json()
      if (!response.ok || body.error) {
        setNotice(body.error || 'API caída')
        return
      }
      setLocales(body.locales || [])
      setDisponibilidad(body.dia?.disponibilidad ?? body.dia?.disponibilidad_instantanea ?? null)
      setMuestras(body.dia?.muestras ?? 0)
      setStamp(body.actualizado_en || '')
    } catch {
      setNotice('API caída')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setExpandedKind(null)
    setSoldoutByStore({})
    void refresh()
  }, [agregador])

  const counts = { open: 0, paused: 0, closed: 0, offhours: 0 }
  for (const loc of locales) counts[loc.kind as keyof typeof counts] = (counts[loc.kind as keyof typeof counts] || 0) + 1

  async function openLocal(loc: Local) {
    if (aggDisabled) return
    if (!window.confirm(`¿Abrir local «${loc.name || loc.store_id}» en ${agregador}?`)) return
    setActionBusy(loc.store_id)
    setNotice('')
    try {
      const response = await api('/api/operaciones/local/abrir', {
        agregador,
        store_id: loc.store_id,
        name: loc.name,
      })
      const body = await response.json()
      if (!response.ok || !body.ok) {
        setNotice(body.error || 'No se pudo abrir')
        return
      }
      setNotice(body.message || 'Local abierto')
      await refresh()
    } catch {
      setNotice('API caída')
    } finally {
      setActionBusy(null)
    }
  }

  async function closeLocal(loc: Local) {
    if (aggDisabled) return
    if (!window.confirm(`¿Cerrar / pausar local «${loc.name || loc.store_id}» en ${agregador}?`)) return
    setActionBusy(loc.store_id)
    setNotice('')
    try {
      const response = await api('/api/operaciones/local/cerrar', {
        agregador,
        store_id: loc.store_id,
        name: loc.name,
      })
      const body = await response.json()
      if (!response.ok || !body.ok) {
        setNotice(body.error || 'No se pudo cerrar')
        return
      }
      setNotice(body.message || 'Local en pausa')
      await refresh()
    } catch {
      setNotice('API caída')
    } finally {
      setActionBusy(null)
    }
  }

  async function loadSoldout(loc: Local) {
    if (aggDisabled) return
    const key = loc.store_id
    const prev = soldoutByStore[key]
    if (prev?.items && !prev.error) {
      setSoldoutByStore((s) => ({ ...s, [key]: {} }))
      return
    }
    setSoldoutByStore((s) => ({ ...s, [key]: { loading: true } }))
    try {
      const q = new URLSearchParams({
        agregador,
        store_id: loc.store_id,
        name: loc.name || '',
      })
      const response = await api(`/api/operaciones/local/agotados?${q}`)
      const body = await response.json()
      if (!response.ok || !body.ok) {
        setSoldoutByStore((s) => ({ ...s, [key]: { error: body.error || 'API caída' } }))
        return
      }
      setSoldoutByStore((s) => ({ ...s, [key]: { items: body.items || [] } }))
    } catch {
      setSoldoutByStore((s) => ({ ...s, [key]: { error: 'API caída' } }))
    }
  }

  const subtitle = `${stamp ? `Actualizado ${stamp}` : ''}${disponibilidad != null ? ` · Disponibilidad hoy ${disponibilidad}%` : ''}${muestras ? ` · ${muestras} muestras` : ''}`

  return (
    <PanelShell
      tab="operaciones"
      title="Estado de locales"
      subtitle={subtitle}
      actions={
        <button type="button" className="btn-primary" disabled={busy} onClick={() => refresh()}>
          {busy ? 'Actualizando…' : 'Actualizar'}
        </button>
      }
    >
      <div className="filters">
        <div className="seg">
          {(['uber', 'pedidosya', 'rappi'] as Agregador[]).map((item) => (
            <button
              key={item}
              type="button"
              className={agregador === item ? 'on' : ''}
              onClick={() => setAgregador(item)}
            >
              {item === 'uber' ? 'Uber Eats' : item === 'pedidosya' ? 'PedidosYa' : 'Rappi'}
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <p className={notice.includes('caída') || notice.includes('credencial') ? 'msg-bad' : 'msg-ok'}>{notice}</p>
      )}
      <div className="grid-kpis">
        {KIND_ORDER.map((kind) => {
          const value = counts[kind]
          const expanded = expandedKind === kind
          const inKind = locales.filter((loc) => loc.kind === kind)
          const kpiClass =
            kind === 'open' ? 'open' : kind === 'paused' ? 'paused' : kind === 'closed' ? 'closed' : 'off'
          return (
            <article
              key={kind}
              className={`card card-kpi k-${kpiClass} ${expanded ? 'kpi-expanded' : ''} ${value > 0 ? 'kpi-clickable' : ''}`}
            >
              <button
                type="button"
                className="kpi-head"
                disabled={value === 0}
                onClick={() => setExpandedKind(expanded ? null : kind)}
                aria-expanded={expanded}
              >
                <div className="sub">{KIND_LABEL[kind]}</div>
                <div className="kpi-value">{value}</div>
                {value > 0 && (
                  <span className="sub kpi-chevron" aria-hidden>
                    {expanded ? '▴' : '▾'}
                  </span>
                )}
              </button>
              {expanded && value > 0 && (
                <ul className="kpi-locales">
                  {inKind.map((loc) => (
                    <li key={loc.store_id}>{loc.name || loc.store_id}</li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
      <p className="sub">{locales.length} local(es)</p>
      <div className="grid-stores">
        {locales.map((loc) => {
          const sold = soldoutByStore[loc.store_id]
          const cardBusy = actionBusy === loc.store_id
          return (
            <article key={loc.store_id} className={`store-card ${KIND_CLASS[loc.kind] || ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{loc.name || loc.store_id}</strong>
                <span className={`chip ${loc.kind === 'open' ? 'chip-open' : 'chip-pending'}`}>
                  {KIND_LABEL[loc.kind] || loc.kind}
                </span>
              </div>
              {loc.reason && (
                <p className="sub" style={{ marginTop: 8 }}>
                  {loc.reason}
                  {loc.author ? ` · ${loc.author}` : ''}
                </p>
              )}
              {!aggDisabled && (
                <div className="store-actions">
                  {loc.kind !== 'open' && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={cardBusy || busy}
                      onClick={() => openLocal(loc)}
                    >
                      Abrir
                    </button>
                  )}
                  {loc.kind === 'open' && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={cardBusy || busy}
                      onClick={() => closeLocal(loc)}
                    >
                      Cerrar
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={sold?.loading || busy}
                    onClick={() => loadSoldout(loc)}
                  >
                    {sold?.loading ? 'Consultando…' : sold?.items ? 'Ocultar agotados' : 'Agotados'}
                  </button>
                </div>
              )}
              {sold?.error && <p className="msg-bad" style={{ marginTop: 8, fontSize: 13 }}>{sold.error}</p>}
              {sold?.items && (
                <div className="soldout-panel">
                  {sold.items.length === 0 ? (
                    <p className="sub">Sin ítems agotados.</p>
                  ) : (
                    <ul className="soldout-list">
                      {sold.items.map((row, i) => (
                        <li key={`${row.item}-${i}`}>
                          <span>{row.item}</span>
                          {row.until ? <span className="sub"> · {row.until}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </PanelShell>
  )
}

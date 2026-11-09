import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PanelShell } from '../../app/PanelShell'
import { platformConfigured, type CredentialsStatusBody } from '../../lib/credential-status'
import type { BoardSummary, DisputeRow } from '../../engine/dispute-list'
import { remainingWait } from '../../engine/wait'
import { api } from '../../lib/api'

type Phase = 'login' | 'loading' | 'list' | 'empty' | 'error'
type Source = 'uber' | 'pedidosya'
type Tab = 'pending' | 'disputed' | 'accepted' | 'rejected' | 'all'
type Row = DisputeRow & { warning?: string; images?: string[] }

const CHICKEN = `    __
  <(o )___
   ( ._> /
    \`---'`

const TABS: { id: Tab; label: string; key?: keyof BoardSummary }[] = [
  { id: 'pending', label: 'Pendientes', key: 'pending' },
  { id: 'disputed', label: 'Abiertas', key: 'open' },
  { id: 'accepted', label: 'Cerradas ganadas', key: 'won' },
  { id: 'rejected', label: 'Cerradas perdidas', key: 'lost' },
  { id: 'all', label: 'Todas' },
]

const EMPTY_SUMMARY: BoardSummary = {
  pending: 0,
  open: 0,
  won: 0,
  lost: 0,
  reported: 0,
  missed: 0,
  canceled: 0,
  pendingAmount: 0,
}

async function hold(startedAt: number): Promise<void> {
  const wait = remainingWait(startedAt, Date.now())
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

function money(value: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
}

function when(value?: string): string {
  if (!value) return ''
  const numeric = Number(value)
  const date = Number.isFinite(numeric) && value.trim() !== ''
    ? new Date(numeric > 1e12 ? numeric : numeric > 1e9 ? numeric * 1000 : Number.NaN)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

const ISSUE_ES: Record<string, string> = {
  'issue with items': 'Problema con productos',
  'wrong order': 'Pedido incorrecto',
  'missing items': 'Productos faltantes',
  'missing item': 'Producto faltante',
  'partial missing items': 'Productos faltantes',
  'food quality': 'Calidad del pedido',
  'never received': 'No entregado',
  'order canceled': 'Pedido cancelado',
  'order cancelled': 'Pedido cancelado',
}

function issueLabel(value?: string): string {
  if (!value) return ''
  const clean = value.replace(/^ORDER_(ISSUE|TAG)_/, '').replace(/_/g, ' ').toLowerCase()
  return ISSUE_ES[clean] || clean
}

function bucketLabel(row: Row): string {
  if (row.bucket === 'abierta') return 'Abierta'
  if (row.bucket === 'ganada') return 'Ganada'
  if (row.bucket === 'perdida') return 'Perdida'
  return 'Pendiente'
}

type DisputesViewProps = { embedded?: boolean }

export function DisputesView({ embedded }: DisputesViewProps = {}) {
  const [phase, setPhase] = useState<Phase>(embedded ? 'loading' : 'login')
  const [caption, setCaption] = useState('revisando informacion')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [notice, setNotice] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(Boolean(embedded))
  const [source, setSource] = useState<Source>('uber')
  const [tab, setTab] = useState<Tab>('pending')
  const [dias, setDias] = useState(30)
  const [query, setQuery] = useState('')
  const [summary, setSummary] = useState<BoardSummary>(EMPTY_SUMMARY)
  const [topStores, setTopStores] = useState<{ store: string; count: number }[]>([])
  const [windowLabel, setWindowLabel] = useState('')
  const [ready, setReady] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const imagesRef = useRef<Record<string, Pick<Row, 'images' | 'warning' | 'hasAttachedImage'>>>({})
  const cache = useRef<Record<string, { rows: Row[]; summary: BoardSummary; topStores: { store: string; count: number }[]; windowLabel: string }>>({})
  const requestId = useRef(0)

  useEffect(() => {
    if (!embedded) return
    void (async () => {
      const status = await refreshStatus()
      if (status && !platformConfigured(status.uber) && !platformConfigured(status.pya, status.pedidosya)) {
        setPhase('error')
        setNotice('Sin sesión de Uber/PedidosYa — en Módulos → Credenciales traé la cookie o hacé login')
        return
      }
      await loadList('uber', 'pending', dias)
    })()
  }, [embedded])

  async function refreshStatus() {
    const response = await api('/api/credentials/status')
    if (!response.ok) return
    const body = await response.json()
    return body as CredentialsStatusBody
  }

  async function enter(event: FormEvent) {
    event.preventDefault()
    const response = await api('/api/login', { user, password })
    setPassword('')
    if (!response.ok) {
      setNotice('sin credencial')
      return
    }
    setNotice('')
    setLoggedIn(true)
    const status = await refreshStatus()
    if (status && !platformConfigured(status.uber) && !platformConfigured(status.pya, status.pedidosya)) {
      setPhase('error')
      setNotice('Sin sesión Uber/PedidosYa — Módulos → Credenciales')
      return
    }
    await loadList('uber', 'pending', dias)
  }

  function applyCached(saved: { rows: Row[]; summary: BoardSummary; topStores: { store: string; count: number }[]; windowLabel: string }) {
    requestId.current += 1
    setRows(saved.rows.map((row) => {
      const savedImage = imagesRef.current[`${row.aggregator}:${row.orderId}`]
      return savedImage ? { ...row, ...savedImage } : row
    }))
    setSummary(saved.summary)
    if (saved.topStores.length) setTopStores(saved.topStores)
    setWindowLabel(saved.windowLabel)
    setNotice('')
    setPhase(saved.rows.length === 0 && saved.summary.pending + saved.summary.open + saved.summary.won + saved.summary.lost === 0 ? 'empty' : 'list')
  }

  function choose(next: Source) {
    setSource(next)
    setTab('pending')
    const saved = cache.current[`${next}:pending:${dias}`]
    if (saved) {
      applyCached(saved)
      return
    }
    void loadList(next, 'pending', dias)
  }

  function chooseTab(next: Tab) {
    setTab(next)
    const saved = cache.current[`${source}:${next}:${dias}`]
    if (saved) {
      applyCached(saved)
      return
    }
    void loadList(source, next, dias)
  }

  async function loadList(agregador: Source, estado: Tab, days: number, force = false) {
    const cacheKey = `${agregador}:${estado}:${days}`
    if (!force && cache.current[cacheKey]) {
      applyCached(cache.current[cacheKey])
      return
    }
    const id = ++requestId.current
    const started = Date.now()
    setCaption('revisando informacion')
    setNotice('')
    setPhase('loading')
    try {
      const response = await api(`/api/disputes?agregador=${agregador}&estado=${estado}&dias=${days}`)
      await hold(started)
      if (id !== requestId.current) return
      const body = await response.json()
      if (!response.ok) {
        setNotice(body.error || 'API caída')
        setPhase('error')
        return
      }
      const next = ((body.rows || []) as Row[]).map((row) => {
        const saved = imagesRef.current[`${row.aggregator}:${row.orderId}`]
        return saved ? { ...row, ...saved } : row
      })
      const nextSummary = (body.summary || EMPTY_SUMMARY) as BoardSummary
      const nextTop = (body.topStores || []) as { store: string; count: number }[]
      const span = body.window ? `${body.window.from} a ${body.window.to} (${body.window.timezone})` : ''
      cache.current[cacheKey] = { rows: next, summary: nextSummary, topStores: nextTop, windowLabel: span }
      setRows(next)
      setSummary(nextSummary)
      if (estado === 'pending' && nextTop.length) setTopStores(nextTop)
      setWindowLabel(span)
      const total = nextSummary.pending + nextSummary.open + nextSummary.won + nextSummary.lost
      setPhase(next.length === 0 && total === 0 ? 'empty' : 'list')
    } catch {
      await hold(started)
      if (id !== requestId.current) return
      setNotice('API caída')
      setPhase('error')
    }
  }

  async function addImage(agregador: Row['aggregator'], numero: string) {
    if (!numero) return
    const started = Date.now()
    setCaption('revisando informacion')
    setBusy(true)
    const response = await api('/api/evidencia', { agregador, numero_orden: numero })
    await hold(started)
    const body = await response.json()
    setRows((current) =>
      current.map((item) => {
        if (item.orderId !== numero || item.aggregator !== agregador) return item
        const next = !response.ok && !body.warning
          ? { ...item, warning: body.error || 'API caída', images: [] as string[], hasAttachedImage: false }
          : !body.ok
            ? { ...item, warning: body.warning || 'No hay imagen de ese pedido', images: [] as string[], hasAttachedImage: false }
            : { ...item, warning: undefined, images: body.images.map((image: { id: string }) => image.id), hasAttachedImage: true }
        imagesRef.current[`${agregador}:${numero}`] = { images: next.images, warning: next.warning, hasAttachedImage: next.hasAttachedImage }
        return next
      }),
    )
    if (!response.ok && !body.warning) setNotice(body.error || 'API caída')
    else if (!body.ok) setNotice(body.warning || 'No hay imagen de ese pedido')
    else {
      setOpenId(`${agregador}-${numero}`)
      setNotice('')
    }
    setBusy(false)
    setPhase('list')
  }

  async function armar(row: Row) {
    if (!row.images?.length) return
    const response = await api('/api/disputas/armar', {
      agregador: row.aggregator,
      numero_orden: row.orderId,
      evidence_ids: row.images,
    })
    const body = await response.json()
    if (!response.ok || !body.request) {
      setNotice(body.error || 'API caída')
      return
    }
    setReady((current) => ({ ...current, [`${row.aggregator}:${row.orderId}`]: body.request.evidence_ids }))
    setNotice('Request armado')
  }

  async function enviar(row: Row) {
    const evidenceIds = ready[`${row.aggregator}:${row.orderId}`]
    if (!evidenceIds?.length) return
    const response = await api('/api/disputas/enviar', {
      agregador: row.aggregator,
      numero_orden: row.orderId,
      evidence_ids: evidenceIds,
    })
    const body = await response.json()
    setNotice(body.message || body.error || 'API caída')
  }

  const needle = query.trim().toLowerCase()
  const visible = rows.filter((row) => !needle || row.orderId.toLowerCase().includes(needle) || (row.store || '').toLowerCase().includes(needle))
  const closed = summary.won + summary.lost
  const rate = closed ? Math.round((summary.won / closed) * 100) : 0
  const readyCount = Object.keys(ready).filter((id) => id.startsWith(`${source}:`)).length
  const cards = [
    { label: 'Cobros sin disputar', value: String(summary.pending), detail: summary.pendingAmount ? `${money(summary.pendingAmount)} cobrados` : 'cobrados', accent: 'var(--warn)' },
    { label: 'Disputas abiertas', value: String(summary.open), detail: 'en revisión', accent: '#9a8cb8' },
    { label: 'Ganadas', value: String(summary.won), detail: 'recuperados', accent: 'var(--ok)' },
    { label: 'Perdidas', value: String(summary.lost), detail: 'no recuperados', accent: 'var(--bad)' },
    { label: 'Tasa de éxito', value: `${rate}%`, detail: 'ganadas / cerradas', accent: 'var(--line)' },
    { label: 'Requests armados', value: String(readyCount), detail: 'listos para enviar', accent: 'var(--line)' },
  ]
  const stampParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date())
  const stampPart = (type: string) => stampParts.find((part) => part.type === type)?.value || ''
  const stamp = `${stampPart('day')}/${stampPart('month')}, ${stampPart('hour')}:${stampPart('minute')} ${stampPart('dayPeriod').toLowerCase().startsWith('a') ? 'a. m.' : 'p. m.'}`
  const periodTools = (
    <div className="filters" style={{ margin: 0 }}>
      <span className="sub">Período</span>
      <select className="field-input" aria-label="Período" value={dias} onChange={(event) => { const days = Number(event.target.value); setDias(days); void loadList(source, tab, days, true) }}>
        <option value={7}>7 días</option>
        <option value={30}>30 días</option>
        <option value={90}>90 días</option>
      </select>
      <button type="button" className="btn-primary" onClick={() => loadList(source, tab, dias, true)}>Actualizar</button>
    </div>
  )

  if (!loggedIn) {
    return (
      <form onSubmit={enter} className="login-wrap">
        <div className="card login-card" style={{ display: 'grid', gap: 12 }}>
          <input aria-label="usuario" className="field-input" value={user} onChange={(event) => setUser(event.target.value)} />
          <input aria-label="contraseña" className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="submit" className="btn-primary">Entrar</button>
          {notice && <p className="msg-bad">{notice}</p>}
        </div>
      </form>
    )
  }

  const shell = (
    <PanelShell
      tab="disputas"
      title={`Disputas · ${source === 'uber' ? 'Uber Eats' : 'PedidosYa'}`}
      subtitle={`Actualizado ${stamp}${windowLabel ? ` · ${windowLabel}` : ''}`}
      actions={periodTools}
    >
      <div className="filters">
        <div className="seg">
          <button type="button" className={source === 'uber' ? 'on' : ''} onClick={() => choose('uber')}>Uber</button>
          <button type="button" className={source === 'pedidosya' ? 'on' : ''} onClick={() => choose('pedidosya')}>PedidosYa</button>
        </div>
      </div>
      <section className="grid-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {cards.map((card) => (
          <article key={card.label} className="card card-kpi" style={{ borderTopColor: card.accent, borderTopWidth: 3, borderTopStyle: 'solid', marginBottom: 0 }}>
            <p className="sub" style={{ margin: 0 }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 4px', lineHeight: 1 }}>{card.value}</p>
            <p className="sub" style={{ margin: 0 }}>{card.detail}</p>
          </article>
        ))}
      </section>
      <p className="sub">
        Con incidencia reportada: <b style={{ color: 'var(--ink)' }}>{summary.reported}</b>
        {' · '}No entregados: <b style={{ color: 'var(--ink)' }}>{summary.missed}</b>
        {' · '}Cancelados: <b style={{ color: 'var(--ink)' }}>{summary.canceled}</b>
      </p>
      {topStores.length > 0 && (
        <p className="sub">
          Más cobros pendientes:{' '}
          {topStores.map((item) => (
            <span key={item.store}>
              {' '}
              <b style={{ color: 'var(--ink)' }}>{item.store}</b> ({item.count})
            </span>
          ))}
        </p>
      )}
      <div className="filters">
        <div className="seg">
          {TABS.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? 'on' : ''} onClick={() => chooseTab(item.id)}>
              {item.label}
              {item.key ? ` ${summary[item.key]}` : ''}
            </button>
          ))}
        </div>
        <input aria-label="Buscar pedido o tienda" className="field-input" placeholder="Buscar pedido o tienda" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: 2, minWidth: 180 }} />
        <button type="button" className="btn-secondary" onClick={() => addImage(source, query.trim())}>Buscar imagen manual</button>
      </div>
      {notice && <p className={notice === 'Request armado' ? 'msg-ok' : 'msg-bad'}>{notice}</p>}
      {(phase === 'loading' || busy) && <pre className="sub">{`${CHICKEN} ${caption}`}</pre>}
      {phase === 'empty' && <pre className="sub">{`${CHICKEN}\ntodo en orden hoy`}</pre>}
      {phase === 'list' && (
        <div className="card" style={{ padding: 12 }}>
          <p className="sub">{visible.length} pedido(s)</p>
          <div className="disputes-table">
            <div className="disputes-head">
              <span>PEDIDO</span><span>TIENDA</span><span>FECHA</span><span>PROBLEMA</span><span>MONTO</span><span>ESTADO</span><span />
            </div>
            {visible.map((row) => {
              const key = `${row.aggregator}-${row.orderId}`
              const id = `${row.aggregator}:${row.orderId}`
              const hasImage = Boolean(row.images?.length)
              const armed = Boolean(ready[id]?.length)
              return (
                <article key={key} className="disputes-row">
                  <b className="clip">{row.orderId}</b>
                  <span className="clip">{row.store || ''}</span>
                  <span className="clip sub">{when(row.requested)}</span>
                  <span className="clip">{issueLabel(row.issue || row.status)}</span>
                  <span className="clip">{row.amount != null ? money(row.amount) : ''}</span>
                  <span className="clip">
                    <span className="chip chip-pending">{bucketLabel(row)}</span>
                    {armed && <span className="chip chip-armed">Request armado</span>}
                  </span>
                  <span style={{ display: 'grid', gap: 4 }}>
                    <button type="button" className="btn-primary" style={{ width: '100%', opacity: hasImage ? 1 : 0.45 }} disabled={!hasImage} onClick={() => armar(row)}>Armar disputa</button>
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '6px 8px' }} onClick={() => addImage(row.aggregator, row.orderId)}>Agregar imagen</button>
                    {armed && <button type="button" className="btn-secondary" onClick={() => enviar(row)}>Enviar disputa</button>}
                  </span>
                  {row.warning && <p className="msg-bad" style={{ gridColumn: '1 / -1', margin: 0 }}>{row.warning}</p>}
                  {openId === key && row.images?.map((imageId) => (
                    <img key={imageId} alt="" src={`/api/evidencia/${imageId}/imagen`} style={{ gridColumn: '1 / -1', maxWidth: 240, borderRadius: 10 }} />
                  ))}
                </article>
              )
            })}
          </div>
        </div>
      )}
    </PanelShell>
  )

  return embedded ? shell : <>{shell}</>
}

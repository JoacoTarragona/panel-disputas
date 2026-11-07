import { useRef, useState, type FormEvent } from 'react'
import { theme } from '../../constants/theme'
import type { BoardSummary, DisputeRow } from '../../engine/dispute-list'
import { remainingWait } from '../../engine/wait'

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

async function send(path: string, body?: unknown, method?: string): Promise<Response> {
  return fetch(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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

function issueLabel(value?: string): string {
  if (!value) return ''
  return value.replace(/^ORDER_(ISSUE|TAG)_/, '').replace(/_/g, ' ').toLowerCase()
}

function bucketLabel(row: Row): string {
  if (row.bucket === 'abierta') return 'Abierta'
  if (row.bucket === 'ganada') return 'Ganada'
  if (row.bucket === 'perdida') return 'Perdida'
  return 'Pendiente'
}

export function DisputesView() {
  const [phase, setPhase] = useState<Phase>('login')
  const [caption, setCaption] = useState('revisando informacion')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [notice, setNotice] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [uberState, setUberState] = useState('missing')
  const [pyaState, setPyaState] = useState('missing')
  const [uberValue, setUberValue] = useState('')
  const [pyaValue, setPyaValue] = useState('')
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
  const [showCredentials, setShowCredentials] = useState(false)
  const cache = useRef<Record<string, { rows: Row[]; summary: BoardSummary; topStores: { store: string; count: number }[]; windowLabel: string }>>({})
  const requestId = useRef(0)

  async function refreshStatus() {
    const response = await send('/api/credentials/status')
    if (!response.ok) return
    const body = await response.json()
    setUberState(body.uber)
    setPyaState(body.pedidosya)
    return body as { uber: string; pedidosya: string }
  }

  async function enter(event: FormEvent) {
    event.preventDefault()
    const response = await send('/api/login', { user, password })
    setPassword('')
    if (!response.ok) {
      setNotice('sin credencial')
      return
    }
    setNotice('')
    setLoggedIn(true)
    const status = await refreshStatus()
    if (status && status.uber === 'missing' && status.pedidosya === 'missing') {
      setPhase('error')
      setNotice('sin credencial')
      return
    }
    await loadList('uber', 'pending', dias)
  }

  async function saveCredential(which: Source) {
    const value = which === 'uber' ? uberValue : pyaValue
    const response = await send(which === 'uber' ? '/api/credentials/uber' : '/api/credentials/pedidosya', { value }, 'PUT')
    const body = await response.json()
    if (which === 'uber') setUberValue('')
    else setPyaValue('')
    if (!response.ok) {
      setNotice(body.error || 'API caída')
      return
    }
    setUberState(body.uber)
    setPyaState(body.pedidosya)
    for (const key of Object.keys(cache.current)) {
      if (key.startsWith(`${which}:`)) delete cache.current[key]
    }
    if (source === which) await loadList(which, tab, dias, true)
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
      const response = await send(`/api/disputes?agregador=${agregador}&estado=${estado}&dias=${days}`)
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
    const response = await send('/api/evidencia', { agregador, numero_orden: numero })
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
    const response = await send('/api/disputas/armar', {
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
    const response = await send('/api/disputas/enviar', {
      agregador: row.aggregator,
      numero_orden: row.orderId,
      evidence_ids: evidenceIds,
    })
    const body = await response.json()
    setNotice(body.message || body.error || 'API caída')
  }

  const page = {
    minHeight: '100vh',
    background: theme.background,
    color: theme.text,
    padding: theme.space.lg,
    fontFamily: 'system-ui, sans-serif',
    fontSize: theme.fontSize.md,
  }
  const button = {
    background: 'transparent',
    color: theme.text,
    border: `2px solid ${theme.border}`,
    borderRadius: 0,
    padding: `${theme.space.sm}px ${theme.space.md}px`,
    fontSize: theme.fontSize.sm,
    fontWeight: 700,
  }
  const needle = query.trim().toLowerCase()
  const visible = rows.filter((row) => !needle || row.orderId.toLowerCase().includes(needle) || (row.store || '').toLowerCase().includes(needle))
  const closed = summary.won + summary.lost
  const rate = closed ? Math.round((summary.won / closed) * 100) : 0
  const readyCount = Object.keys(ready).filter((id) => id.startsWith(`${source}:`)).length
  const cards = [
    { label: 'Cobros sin disputar', value: String(summary.pending), detail: summary.pendingAmount ? `${money(summary.pendingAmount)} cobrados` : 'cobrados', color: theme.accent },
    { label: 'Disputas abiertas', value: String(summary.open), detail: 'en revisión', color: theme.textMuted },
    { label: 'Ganadas', value: String(summary.won), detail: 'recuperados', color: theme.success },
    { label: 'Perdidas', value: String(summary.lost), detail: 'no recuperados', color: theme.error },
    { label: 'Tasa de éxito', value: `${rate}%`, detail: 'ganadas / cerradas', color: theme.border },
    { label: 'Requests armados', value: String(readyCount), detail: 'listos para enviar', color: theme.accent },
  ]

  return (
    <main style={page}>
      <img src="/tarragona-logo.png" alt="Tarragona" style={{ height: 72, borderBottom: `4px solid ${theme.accent}` }} />
      {phase === 'login' && (
        <form onSubmit={enter} style={{ marginTop: theme.space.lg, display: 'grid', gap: theme.space.sm, maxWidth: 280 }}>
          <input aria-label="usuario" value={user} onChange={(event) => setUser(event.target.value)} style={button} />
          <input aria-label="contraseña" type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={button} />
          <button type="submit" style={button}>Entrar</button>
          {notice && <p style={{ color: theme.error }}>{notice}</p>}
        </form>
      )}
      {loggedIn && (
        <>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: theme.space.md, alignItems: 'flex-end', marginTop: theme.space.lg, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Disputas · {source === 'uber' ? 'Uber Eats' : 'PedidosYa'}</h1>
              <p style={{ color: theme.textMuted, fontSize: theme.fontSize.sm, margin: `${theme.space.xs}px 0 0` }}>
                Actualizado {windowLabel || 'America/Santiago'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: theme.fontSize.sm }}>Período</span>
              <select aria-label="Período" value={dias} onChange={(event) => { const days = Number(event.target.value); setDias(days); void loadList(source, tab, days, true) }} style={button}>
                <option value={7}>7 días</option>
                <option value={30}>30 días</option>
                <option value={90}>90 días</option>
              </select>
              <button type="button" style={{ ...button, borderColor: theme.accent }} onClick={() => loadList(source, tab, dias, true)}>Actualizar</button>
            </div>
          </header>
          <div style={{ display: 'flex', gap: theme.space.sm, marginTop: theme.space.md }}>
            <button type="button" style={{ ...button, borderColor: source === 'uber' ? theme.accent : theme.border }} onClick={() => choose('uber')}>Uber</button>
            <button type="button" style={{ ...button, borderColor: source === 'pedidosya' ? theme.accent : theme.border }} onClick={() => choose('pedidosya')}>PedidosYa</button>
            <button type="button" style={button} onClick={() => setShowCredentials((current) => !current)}>Credenciales</button>
          </div>
          {showCredentials && (
            <section style={{ marginTop: theme.space.md, display: 'grid', gap: theme.space.sm, maxWidth: 640 }}>
              <p style={{ color: theme.textMuted }}>Uber: {uberState === 'configured' ? 'cargada' : 'falta'} · PedidosYa: {pyaState === 'configured' ? 'cargada' : 'falta'}</p>
              <textarea aria-label="cookie de Uber" value={uberValue} onChange={(event) => setUberValue(event.target.value)} style={{ ...button, minHeight: 72 }} autoComplete="off" />
              <button type="button" style={button} onClick={() => saveCredential('uber')}>Guardar Uber</button>
              <textarea aria-label="tokens de PedidosYa" value={pyaValue} onChange={(event) => setPyaValue(event.target.value)} style={{ ...button, minHeight: 72 }} autoComplete="off" />
              <button type="button" style={button} onClick={() => saveCredential('pedidosya')}>Guardar PedidosYa</button>
            </section>
          )}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: theme.space.sm, marginTop: theme.space.lg }}>
            {cards.map((card) => (
              <article key={card.label} style={{ border: `1px solid ${theme.border}`, borderTop: `3px solid ${card.color}`, padding: theme.space.md }}>
                <p style={{ color: theme.textMuted, fontSize: theme.fontSize.sm, margin: 0 }}>{card.label}</p>
                <p style={{ fontSize: theme.fontSize.lg, margin: `${theme.space.xs}px 0` }}>{card.value}</p>
                <p style={{ color: theme.textMuted, fontSize: theme.fontSize.sm, margin: 0 }}>{card.detail}</p>
              </article>
            ))}
          </section>
          <p style={{ color: theme.textMuted, fontSize: theme.fontSize.sm }}>
            Con incidencia reportada: {summary.reported} · No entregados: {summary.missed} · Cancelados: {summary.canceled}
          </p>
          {topStores.length > 0 && (
            <p style={{ color: theme.text, fontSize: theme.fontSize.sm }}>
              Más cobros pendientes: {topStores.map((item) => `${item.store} (${item.count})`).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: theme.space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map((item) => (
              <button key={item.id} type="button" style={{ ...button, borderColor: tab === item.id ? theme.accent : theme.border }} onClick={() => chooseTab(item.id)}>
                {item.label}{item.key ? ` ${summary[item.key]}` : ''}
              </button>
            ))}
            <input aria-label="Buscar pedido o tienda" placeholder="Buscar pedido o tienda" value={query} onChange={(event) => setQuery(event.target.value)} style={button} />
            <button type="button" style={button} onClick={() => addImage(source, query.trim())}>Buscar imagen manual</button>
          </div>
          {notice && <p style={{ color: notice === 'Request armado' ? theme.success : theme.error }}>{notice}</p>}
          {(phase === 'loading' || busy) && <pre style={{ color: theme.text }}>{`${CHICKEN} ${caption}`}</pre>}
          {phase === 'empty' && <pre style={{ color: theme.text }}>{`${CHICKEN}\ntodo en orden hoy`}</pre>}
          {phase === 'list' && (
            <div style={{ marginTop: theme.space.md }}>
              <p style={{ color: theme.textMuted, fontSize: theme.fontSize.sm }}>{visible.length} pedido(s)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.4fr 1fr 1.2fr 0.7fr 0.9fr auto', gap: theme.space.md, color: theme.textMuted, fontSize: theme.fontSize.sm }}>
                <span>PEDIDO</span><span>TIENDA</span><span>FECHA</span><span>PROBLEMA</span><span>MONTO</span><span>ESTADO</span><span />
              </div>
              {visible.map((row) => {
                const key = `${row.aggregator}-${row.orderId}`
                const id = `${row.aggregator}:${row.orderId}`
                const hasImage = Boolean(row.images?.length)
                const armed = Boolean(ready[id]?.length)
                const border = row.warning ? theme.error : hasImage ? theme.success : theme.border
                const locked = { ...button, color: theme.textMuted, borderColor: theme.textMuted }
                return (
                  <article key={key} style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.4fr 1fr 1.2fr 0.7fr 0.9fr auto', gap: theme.space.md, alignItems: 'center', borderBottom: `1px solid ${border}`, padding: `${theme.space.sm}px 0` }}>
                    <span>{row.orderId}</span>
                    <span>{row.store || ''}</span>
                    <span>{when(row.requested)}</span>
                    <span>{issueLabel(row.issue || row.status)}</span>
                    <span>{row.amount != null ? money(row.amount) : ''}</span>
                    <span>{bucketLabel(row)}{armed ? ' · Request armado' : ''}</span>
                    <span style={{ display: 'flex', gap: theme.space.xs }}>
                      <button type="button" style={button} onClick={() => addImage(row.aggregator, row.orderId)}>Agregar imagen</button>
                      <button type="button" style={hasImage ? { ...button, borderColor: theme.success } : locked} disabled={!hasImage} onClick={() => armar(row)}>Armar disputa</button>
                      <button type="button" style={armed ? { ...button, borderColor: theme.accent } : locked} disabled={!armed} onClick={() => enviar(row)}>Enviar disputa</button>
                    </span>
                    {row.warning && <p style={{ gridColumn: '1 / -1', color: theme.error }}>{row.warning}</p>}
                    {openId === key && row.images?.map((imageId) => (
                      <img key={imageId} alt="" src={`/api/evidencia/${imageId}/imagen`} style={{ gridColumn: '1 / -1', maxWidth: 240 }} />
                    ))}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}

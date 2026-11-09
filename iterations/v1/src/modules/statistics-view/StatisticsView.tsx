import { useEffect, useState } from 'react'
import { PanelShell } from '../../app/PanelShell'
import { api } from '../../lib/api'

type Agregador = 'uber' | 'pedidosya' | 'rappi'

type SerieRow = {
  periodo: string
  disponibilidad: number | null
  disponibilidad_corrida: number | null
}

type MotivoRow = {
  motivo: string
  veces: number
  minutos: number
}

const RANGO: { id: number; label: string }[] = [
  { id: 0, label: 'Hoy' },
  { id: 7, label: '7 días' },
  { id: 30, label: '30 días' },
  { id: 180, label: '6 meses' },
]

export function StatisticsView() {
  const [agregador, setAgregador] = useState<Agregador>('uber')
  const [dias, setDias] = useState(7)
  const [serie, setSerie] = useState<SerieRow[]>([])
  const [motivos, setMotivos] = useState<MotivoRow[]>([])
  const [disponibilidad, setDisponibilidad] = useState<number | null>(null)
  const [muestras, setMuestras] = useState(0)
  const [agrupar, setAgrupar] = useState('dia')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function load() {
    setBusy(true)
    setNotice('')
    const hasta = new Date().toISOString()
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
    const group = dias === 0 ? 'hora' : dias >= 180 ? 'mes' : 'dia'
    setAgrupar(group)
    try {
      const q = new URLSearchParams({ agregador, desde, hasta, agrupar: group })
      const response = await api(`/api/operaciones/resumen?${q}`)
      const body = await response.json()
      if (!response.ok) {
        setNotice(body.error || 'API caída')
        return
      }
      setSerie(body.serie || [])
      setMotivos(body.motivos || [])
      setDisponibilidad(body.disponibilidad ?? null)
      setMuestras(body.muestras ?? 0)
      if (body.error === 'sin conexion') setNotice('sin conexion')
    } catch {
      setNotice('API caída')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [agregador, dias])

  const maxBar = Math.max(1, ...serie.map((row) => row.disponibilidad_corrida ?? row.disponibilidad ?? 0))

  return (
    <PanelShell
      tab="estadisticas"
      title="Motivos y estadísticas"
      subtitle={`Agrupado por ${agrupar}${disponibilidad != null ? ` · Disponibilidad ${disponibilidad}%` : ''}${muestras ? ` · ${muestras} muestras` : ''}`}
      actions={
        <button type="button" className="btn-primary" disabled={busy} onClick={() => load()}>
          Actualizar
        </button>
      }
    >
      <div className="filters">
        <div className="seg">
          {(['uber', 'pedidosya', 'rappi'] as Agregador[]).map((item) => (
            <button key={item} type="button" className={agregador === item ? 'on' : ''} onClick={() => setAgregador(item)}>
              {item === 'uber' ? 'Uber Eats' : item === 'pedidosya' ? 'PedidosYa' : 'Rappi'}
            </button>
          ))}
        </div>
        <div className="seg">
          {RANGO.map((item) => (
            <button key={item.id} type="button" className={dias === item.id ? 'on' : ''} onClick={() => setDias(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {notice && <p className="msg-bad">{notice}</p>}
      <section className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Curva de disponibilidad</h2>
        {serie.length === 0 ? (
          <p className="sub">Sin muestras. Programá el recolector o actualizá en Operaciones.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {serie.map((row) => {
              const value = row.disponibilidad_corrida ?? row.disponibilidad ?? 0
              return (
                <div key={row.periodo} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) 1fr 48px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span className="sub">{row.periodo}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(value / maxBar) * 100}%` }} />
                  </div>
                  <span>{value != null ? `${value}%` : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section className="card">
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Motivos de pausa / cierre</h2>
        {motivos.length === 0 ? (
          <p className="sub">Aún no hay motivos en el historial.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {motivos.map((row) => (
              <div key={row.motivo} className="sub">
                <strong style={{ color: 'var(--ink)' }}>{row.motivo}</strong>
                {' · '}
                {row.veces} veces · {row.minutos} min
              </div>
            ))}
          </div>
        )}
      </section>
    </PanelShell>
  )
}

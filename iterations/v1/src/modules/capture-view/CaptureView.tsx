import { useState, type FormEvent } from 'react'
import { PanelShell } from '../../app/PanelShell'
import { api } from '../../lib/api'

type Agregador = 'uber' | 'pedidosya' | 'rappi'

export function CaptureView() {
  const [agregador, setAgregador] = useState<Agregador>('uber')
  const [numeroOrden, setNumeroOrden] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [notice, setNotice] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    setOk(false)
    if (!numeroOrden.trim() || !file) {
      setNotice('Falta el número de pedido o la imagen')
      return
    }
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
      const imagen = btoa(binary)
      const response = await api('/api/captura/evidencia', { agregador, numero_orden: numeroOrden.trim(), imagen })
      const body = await response.json()
      if (!response.ok) {
        setNotice(body.error || 'No se pudo guardar la imagen')
        return
      }
      setOk(true)
      setNumeroOrden('')
      setFile(null)
    } catch {
      setNotice('API caída')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell
      tab="captura"
      title="Capturar imagen"
      subtitle="Mismo número de pedido que en la plataforma. La foto queda rotulada en evidencia."
    >
      <form className="card" style={{ maxWidth: 480 }} onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label className="sub" htmlFor="cap-agregador">
            Agregador
          </label>
          <select id="cap-agregador" className="field-input" style={{ marginTop: 6, width: '100%' }} value={agregador} onChange={(e) => setAgregador(e.target.value as Agregador)}>
            <option value="uber">Uber Eats</option>
            <option value="pedidosya">PedidosYa</option>
            <option value="rappi">Rappi</option>
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="sub" htmlFor="cap-pedido">
            N.º pedido plataforma
          </label>
          <input id="cap-pedido" className="field-input big" style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }} value={numeroOrden} onChange={(e) => setNumeroOrden(e.target.value)} autoComplete="off" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="sub">Foto (JPEG)</label>
          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginTop: 8 }} />
        </div>
        <button type="submit" className="btn-primary wide" style={{ width: '100%', fontSize: 17 }} disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar imagen'}
        </button>
        {ok && <p className="msg-ok">Imagen guardada</p>}
        {notice && <p className="msg-bad">{notice}</p>}
      </form>
    </PanelShell>
  )
}

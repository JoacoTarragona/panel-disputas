import { useEffect, useState } from 'react'
import { PanelShell } from '../../app/PanelShell'
import { api } from '../../lib/api'
import { platformConfigured, type PlatformMeta } from '../../lib/credential-status'

function formatExpires(seconds: number | undefined) {
  if (seconds == null) return ''
  if (seconds <= 0) return ' · access vencido'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return ` · access ~${h}h ${m}m`
}

function metaLine(meta: PlatformMeta | undefined, legacy?: string) {
  if (!platformConfigured(meta, legacy)) return 'falta'
  if (!meta || typeof meta === 'string') return 'cargada'
  const parts = ['cargada']
  if (meta.mtime) parts.push(`actualizado ${meta.mtime}`)
  if (meta.size) parts.push(`${meta.size} B`)
  return parts.join(' · ')
}

export function CredentialsView() {
  const [uberMeta, setUberMeta] = useState<PlatformMeta | undefined>()
  const [pyaMeta, setPyaMeta] = useState<PlatformMeta | undefined>()
  const [pedidosyaLegacy, setPedidosyaLegacy] = useState('missing')
  const [uberUser, setUberUser] = useState('')
  const [uberPass, setUberPass] = useState('')
  const [uberValue, setUberValue] = useState('')
  const [pyaUser, setPyaUser] = useState('')
  const [pyaPass, setPyaPass] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpPending, setOtpPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [ok, setOk] = useState(false)

  async function refreshStatus() {
    const response = await api('/api/credentials/status')
    if (!response.ok) return
    const body = await response.json()
    if (body.uber && typeof body.uber === 'object') setUberMeta(body.uber)
    else setUberMeta({ present: body.uber === 'configured' })
    if (body.pya && typeof body.pya === 'object') setPyaMeta(body.pya)
    else setPyaMeta({ present: body.pedidosya === 'configured' })
    setPedidosyaLegacy(body.pedidosya || 'missing')
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  async function connectUber(forceLogin: boolean) {
    setNotice('')
    setOk(false)
    const hasLogin = uberUser.trim() && uberPass
    if (forceLogin && !hasLogin) {
      setNotice('Faltan usuario y contraseña de Uber Eats Manager')
      return
    }
    setBusy(true)
    const path = forceLogin ? '/api/credentials/uber/login' : '/api/credentials/uber/refresh'
    const payload = hasLogin
      ? { username: uberUser.trim(), password: uberPass }
      : {}
    const response = await api(path, payload)
    const body = await response.json()
    setBusy(false)
    if (forceLogin) setUberPass('')
    if (!response.ok) {
      const detail = Array.isArray(body.tried) && body.tried.length ? ` (${body.tried.join('; ')})` : ''
      setNotice((body.error || 'No se pudo obtener sesión Uber') + detail)
      return
    }
    await refreshStatus()
    setOk(true)
    setNotice(
      `${body.message || 'Sesión Uber lista'} · ${body.stores ?? '?'} tiendas · origen: ${body.source || 'servidor'}`,
    )
  }

  async function testUber() {
    setNotice('')
    setOk(false)
    setBusy(true)
    const payload = uberValue.trim() ? { cookie: uberValue.trim() } : {}
    const response = await api('/api/credentials/uber/check', payload)
    const body = await response.json()
    setBusy(false)
    if (!response.ok) {
      setNotice(body.error || 'Sesión Uber inválida')
      return
    }
    if (uberValue.trim()) setUberValue('')
    await refreshStatus()
    setOk(true)
    setNotice(`Sesión Uber OK (${body.stores ?? '?'} tiendas)`)
  }

  async function saveUber() {
    setNotice('')
    setOk(false)
    if (!uberValue.trim()) {
      setNotice('Falta la cookie de Uber')
      return
    }
    setBusy(true)
    const response = await api('/api/credentials', { uber: uberValue.trim() })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) {
      setNotice(body.error || 'sin credencial')
      return
    }
    setUberValue('')
    await refreshStatus()
    setOk(true)
  }

  async function startPyaLogin() {
    setNotice('')
    setOk(false)
    if (!pyaUser.trim() || !pyaPass) {
      setNotice('Faltan usuario y contraseña de PedidosYa')
      return
    }
    setBusy(true)
    const response = await api('/api/credentials/pedidosya/login', {
      username: pyaUser.trim(),
      password: pyaPass,
    })
    const body = await response.json()
    setBusy(false)
    setPyaPass('')
    if (!response.ok) {
      setNotice(body.error || 'No se pudo iniciar sesión')
      setOtpPending(false)
      return
    }
    if (body.otp_required) {
      setOtpPending(true)
      setNotice(body.message || 'PedidosYa envió un código a tu correo')
      return
    }
    setOtpPending(false)
    setOtpCode('')
    await refreshStatus()
    setOk(true)
    setNotice('Sesión PedidosYa lista; el script ya puede usar los tokens.')
  }

  async function verifyOtp() {
    setNotice('')
    setOk(false)
    if (!otpCode.trim()) {
      setNotice('Falta el código')
      return
    }
    setBusy(true)
    const response = await api('/api/credentials/pedidosya/otp', {
      username: pyaUser.trim(),
      code: otpCode.trim(),
    })
    const body = await response.json()
    setBusy(false)
    if (!response.ok) {
      setNotice(body.error || 'Código rechazado')
      return
    }
    setOtpPending(false)
    setOtpCode('')
    await refreshStatus()
    setOk(true)
    setNotice(body.message || 'Sesión PedidosYa guardada')
  }

  const uberReady = platformConfigured(uberMeta)
  const pyaReady = platformConfigured(pyaMeta, pedidosyaLegacy)

  return (
    <PanelShell
      tab="credenciales"
      title="Credenciales"
      subtitle="El servidor obtiene la sesión y alimenta uber.py / pya.py. PedidosYa: OTP en esta pantalla si lo pide."
    >
      <p className="filters" style={{ marginTop: 0 }}>
        <span className={`chip ${uberReady ? 'chip-open' : 'chip-pending'}`}>Uber: {metaLine(uberMeta)}</span>
        <span className={`chip ${pyaReady ? 'chip-open' : 'chip-pending'}`}>
          PedidosYa: {metaLine(pyaMeta, pedidosyaLegacy)}
          {formatExpires(pyaMeta?.access_expires_in)}
        </span>
      </p>

      <section className="card">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Uber Eats</h2>
        <p className="sub" style={{ marginTop: 0 }}>
          Con usuario y contraseña el servidor intenta: archivo de la rutina <code>/tmp/uber_cookie_header.txt</code>,{' '}
          <code>UBER_FETCH_CMD</code>, variables de entorno o login al portal (Playwright). También podés pegar la cookie manualmente.
        </p>
        <label className="sub" htmlFor="uber-user">
          Usuario (correo Uber)
        </label>
        <input
          id="uber-user"
          className="field-input"
          style={{ marginTop: 6 }}
          value={uberUser}
          onChange={(e) => setUberUser(e.target.value)}
          autoComplete="username"
        />
        <label className="sub" htmlFor="uber-pass" style={{ display: 'block', marginTop: 12 }}>
          Contraseña
        </label>
        <input
          id="uber-pass"
          className="field-input"
          style={{ marginTop: 6 }}
          type="password"
          value={uberPass}
          onChange={(e) => setUberPass(e.target.value)}
          autoComplete="current-password"
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void connectUber(true)}>
            Conectar Uber
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void connectUber(false)}>
            Traer cookie (servidor)
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void testUber()}>
            Probar sesión
          </button>
          <label className="btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
            Subir archivo
            <input
              type="file"
              accept=".txt,.cookie,text/plain"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((text) => {
                  setUberValue(text.trim())
                  setNotice('Archivo cargado; pulsá Guardar o Probar sesión')
                })
                event.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Si Conectar falla: en Chrome abrí merchants.ubereats.com → F12 → Network → cualquier request → Request headers → copiá <b>Cookie</b> completo.
        </p>
        <textarea
          id="uber-cred"
          className="field-input"
          style={{ minHeight: 72, marginTop: 8 }}
          value={uberValue}
          onChange={(e) => setUberValue(e.target.value)}
          placeholder="Cookie: sid=… (una línea)"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="btn-secondary" style={{ marginTop: 12 }} disabled={busy || !uberValue.trim()} onClick={() => void saveUber()}>
          Guardar cookie pegada
        </button>
      </section>

      <section className="card">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>PedidosYa</h2>
        <p className="sub" style={{ marginTop: 0 }}>
          Mismo usuario y contraseña del portal. El servidor corre el login del script; si PedidosYa pide verificación, completás el código abajo (no reenviar login en bucle).
        </p>
        <label className="sub" htmlFor="pya-user">
          Usuario (correo)
        </label>
        <input
          id="pya-user"
          className="field-input"
          style={{ marginTop: 6 }}
          value={pyaUser}
          onChange={(e) => setPyaUser(e.target.value)}
          autoComplete="username"
        />
        <label className="sub" htmlFor="pya-pass" style={{ display: 'block', marginTop: 12 }}>
          Contraseña
        </label>
        <input
          id="pya-pass"
          className="field-input"
          style={{ marginTop: 6 }}
          type="password"
          value={pyaPass}
          onChange={(e) => setPyaPass(e.target.value)}
          autoComplete="current-password"
          disabled={otpPending}
        />
        {!otpPending && (
          <button type="button" className="btn-primary" style={{ marginTop: 16 }} disabled={busy} onClick={() => void startPyaLogin()}>
            Iniciar sesión PedidosYa
          </button>
        )}

        {otpPending && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <label className="sub" htmlFor="pya-otp">
              Código de verificación
            </label>
            <input
              id="pya-otp"
              className="field-input"
              style={{ marginTop: 6, maxWidth: 200, letterSpacing: '0.2em' }}
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              autoComplete="one-time-code"
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void verifyOtp()}>
                Validar código
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setOtpPending(false)
                  setOtpCode('')
                  setNotice('')
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      {ok && !notice && <p className="msg-ok">Listo</p>}
      {notice && <p className={ok ? 'msg-ok' : otpPending ? 'sub' : 'msg-bad'}>{notice}</p>}
    </PanelShell>
  )
}

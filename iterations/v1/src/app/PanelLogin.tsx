import { type FormEvent, useState } from 'react'
import { api } from '../lib/api'

type Props = {
  onOk: () => void
}

export function PanelLogin({ onOk }: Props) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')

  async function enter(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    const response = await api('/api/login', { user, password })
    if (!response.ok) {
      setNotice('sin credencial')
      return
    }
    onOk()
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={enter}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Panel de operaciones</h1>
        <p className="sub">Operaciones, disputas y captura de evidencia</p>
        <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
          <input aria-label="usuario" className="field-input" value={user} onChange={(e) => setUser(e.target.value)} />
          <input aria-label="contraseña" className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn-primary wide" style={{ width: '100%' }}>
            Entrar
          </button>
          {notice && <p className="msg-bad" style={{ margin: 0 }}>{notice}</p>}
        </div>
      </form>
    </div>
  )
}

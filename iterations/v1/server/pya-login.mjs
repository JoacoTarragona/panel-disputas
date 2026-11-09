import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function runPython(script, env, timeout = 90000) {
  return new Promise((resolve) => {
    const child = spawn(process.env.PYTHON || 'python3', ['-c', script], { env, timeout })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('error', () => resolve({ ok: false, error: 'API caída' }))
    child.on('close', (code) => {
      const text = out.trim() || err.trim()
      if (code === 0 && text.startsWith('OK')) return resolve({ ok: true, step: 'done' })
      if (code === 2 || text === 'OTP') return resolve({ ok: true, step: 'otp' })
      const message = text.replace(/^ERR:/, '').trim() || err.trim() || 'login fallido'
      return resolve({ ok: false, error: sanitizeLoginError(message) })
    })
  })
}

function sanitizeLoginError(message) {
  const plain = String(message || '').slice(0, 240)
  if (plain.toLowerCase().includes('password')) return 'Usuario o contraseña incorrectos'
  if (plain.includes('OTP_REQUIRED')) return 'PedidosYa pidió código; ingrésalo abajo'
  return plain || 'login fallido'
}

function flowReady(cliHome) {
  const flow = path.join(cliHome, '.pya_flow')
  return fs.existsSync(flow) && fs.statSync(flow).size > 0
}

export async function pyaLoginStart({ cliHome, pyaCli, username, password }) {
  const clientDir = path.dirname(pyaCli)
  const env = {
    ...process.env,
    HOME: cliHome,
    PYA_USER: username,
    PYA_PASS: password,
    PYTHONPATH: clientDir,
  }
  const script = `
import os, sys
sys.path.insert(0, ${JSON.stringify(clientDir)})
from api_client import PedidosYaClient, PyaError
try:
    c = PedidosYaClient()
    c.login(${JSON.stringify(username)}, ${JSON.stringify(password)})
    c.save_tokens()
    print("OK")
except PyaError as e:
    msg = str(e)
    if "OTP_REQUIRED" in msg:
        print("OTP")
        raise SystemExit(2)
    print("ERR:" + msg[:200])
    raise SystemExit(1)
`
  return runPython(script, env)
}

export async function pyaLoginVerify({ cliHome, pyaCli, username, code }) {
  const clientDir = path.dirname(pyaCli)
  if (!flowReady(cliHome)) {
    return { ok: false, error: 'No hay login pendiente; vuelve a enviar usuario y contraseña' }
  }
  const env = {
    ...process.env,
    HOME: cliHome,
    PYTHONPATH: clientDir,
  }
  const script = `
import sys
sys.path.insert(0, ${JSON.stringify(clientDir)})
from api_client import PedidosYaClient, PyaError
try:
    c = PedidosYaClient()
    c.verify_otp(${JSON.stringify(code)}, ${JSON.stringify(username)})
    print("OK")
except PyaError as e:
    print("ERR:" + str(e)[:200])
    raise SystemExit(1)
`
  return runPython(script, env)
}

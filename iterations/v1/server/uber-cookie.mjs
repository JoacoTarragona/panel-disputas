import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { prepareUberCookie } from './engine/credentials.js'
import { uberHealth } from './credentials-api.mjs'
import { portalLoginUber } from './uber-portal-login.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DEFAULT_REFRESH = path.resolve(
  process.env.UBER_REFRESH_CLI
    || '/home/dev/app-delivery/panel-delivery-fuentes/clientes/uber/refresh_uber_cookie.py',
)
const STAGING_COOKIE_FILES = [
  '/tmp/uber_cookie_header.txt',
  path.join(os.homedir(), 'uber_cookie_header.txt'),
]

function extraCookiePaths() {
  const paths = []
  if (process.env.UBER_COOKIE_FILE) paths.push(path.resolve(process.env.UBER_COOKIE_FILE))
  if (process.env.DELIVERY_SESSIONS_DIR) {
    paths.push(path.join(path.resolve(process.env.DELIVERY_SESSIONS_DIR), 'uber_cookie'))
  }
  paths.push(
    '/home/dev/app-delivery/panel-delivery-fuentes/delivery-monitor-servidor/sessions/uber_cookie',
    path.join(repoRoot, 'iterations/v1/sessions/uber_cookie'),
    path.join(os.homedir(), '.uber_cookie'),
  )
  return paths
}

function cookieFromSources() {
  const envVal = String(process.env.UBER_COOKIE || '').trim()
  if (envVal && envVal.length > 32) return { ok: true, value: envVal, source: 'UBER_COOKIE' }
  for (const file of extraCookiePaths()) {
    if (!file || !fs.existsSync(file)) continue
    const stat = fs.statSync(file)
    if (stat.size < 32) continue
    const val = fs.readFileSync(file, 'utf8').trim()
    if (val && val.includes('=')) return { ok: true, value: val, source: path.basename(file) }
  }
  return { ok: false }
}

function runPythonArgs(args, env, timeout = 180000) {
  return new Promise((resolve) => {
    const child = spawn(process.env.PYTHON || 'python3', args, { env, timeout, cwd: path.dirname(args[0] || '.') })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('error', () => resolve({ ok: false, error: 'No se pudo ejecutar Python' }))
    child.on('close', (code) => {
      if (code === 0) return resolve({ ok: true })
      const msg = (err.trim() || `exit ${code}`).slice(0, 240)
      return resolve({ ok: false, error: msg, code })
    })
  })
}

async function runFromStaging(cliHome, refreshScript) {
  if (!fs.existsSync(refreshScript)) return { ok: false, skipped: true }
  for (const file of STAGING_COOKIE_FILES) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 32) continue
    const env = { ...process.env, HOME: cliHome }
    const ran = await runPythonArgs([refreshScript, '--from-file', file], env, 120000)
    if (!ran.ok) return ran
    const local = path.join(cliHome, '.uber_cookie')
    if (fs.existsSync(local) && fs.statSync(local).size > 32) {
      return { ok: true, value: fs.readFileSync(local, 'utf8').trim(), source: 'rutina-renovación' }
    }
  }
  return { ok: false, skipped: true }
}

async function runFetchCommand(cliHome, user, pass) {
  const cmd = String(process.env.UBER_FETCH_CMD || '').trim()
  if (!cmd) return { ok: false, skipped: true }
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      HOME: cliHome,
      UBER_USER: user || process.env.UBER_USER || '',
      UBER_PASS: pass || process.env.UBER_PASS || '',
    }
    const child = spawn('bash', ['-lc', cmd], { env, timeout: 300000 })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('close', (code) => {
      const local = path.join(cliHome, '.uber_cookie')
      if (code === 0 && fs.existsSync(local) && fs.statSync(local).size > 32) {
        return resolve({
          ok: true,
          value: fs.readFileSync(local, 'utf8').trim(),
          source: 'UBER_FETCH_CMD',
        })
      }
      resolve({
        ok: false,
        error: (err.trim() || `La rutina Uber falló (código ${code})`).slice(0, 240),
      })
    })
  })
}

async function runPortalLogin(cliHome, user, pass) {
  return portalLoginUber({ cliHome, username: user, password: pass })
}

function runRefreshFromEnv(cliHome, refreshScript) {
  return new Promise((resolve) => {
    if (!fs.existsSync(refreshScript)) {
      return resolve({ ok: false, error: 'Falta el script de renovación Uber en el servidor' })
    }
    const env = { ...process.env, HOME: cliHome }
    if (!(env.UBER_COOKIE || '').trim()) {
      return resolve({ ok: false, skipped: true })
    }
    // from-env only when UBER_COOKIE is set
    const child = spawn(process.env.PYTHON || 'python3', [refreshScript, '--from-env'], {
      env,
      timeout: 120000,
      cwd: path.dirname(refreshScript),
    })
    let err = ''
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('close', (code) => {
      if (code !== 0) {
        return resolve({
          ok: false,
          skipped: !env.UBER_COOKIE,
          error: (err.trim() || 'No se pudo guardar desde UBER_COOKIE').slice(0, 200),
        })
      }
      const local = path.join(cliHome, '.uber_cookie')
      if (!fs.existsSync(local)) return resolve({ ok: false, error: 'El script no dejó cookie en HOME del CLI' })
      return resolve({ ok: true, value: fs.readFileSync(local, 'utf8').trim(), source: 'refresh --from-env' })
    })
  })
}

export async function pullUberCookie({ cliHome, username, password, forceRenew = false }) {
  fs.mkdirSync(cliHome, { recursive: true })
  let draft = { ok: false }
  if (!forceRenew) {
    draft = cookieFromSources()
    const local = path.join(cliHome, '.uber_cookie')
    if (!draft.ok && fs.existsSync(local) && fs.statSync(local).size > 32) {
      draft = { ok: true, value: fs.readFileSync(local, 'utf8').trim(), source: 'sesión-local' }
    }
  }
  const tried = []
  const steps = [
    { id: 'rutina', run: () => runFromStaging(cliHome, DEFAULT_REFRESH) },
    { id: 'fetch', run: () => runFetchCommand(cliHome, username, password) },
    { id: 'env', run: () => runRefreshFromEnv(cliHome, DEFAULT_REFRESH) },
    { id: 'fuentes', run: async () => cookieFromSources().ok ? cookieFromSources() : { ok: false, skipped: true } },
    { id: 'portal', run: () => runPortalLogin(cliHome, username, password) },
  ]
  const hasLogin = Boolean(String(username || process.env.UBER_USER || '').trim() && String(password || process.env.UBER_PASS || '').trim())
  for (const step of steps) {
    if (draft.ok && !forceRenew) break
    if (step.id === 'portal' && !hasLogin) continue
    const next = await step.run()
    if (next.ok) {
      draft = next
      break
    }
    if (next.skipped) continue
    tried.push(`${step.id}: ${next.error || 'falló'}`)
    if (step.id === 'portal') {
      return {
        ok: false,
        error: next.error || 'No se pudo iniciar sesión en Uber',
        tried,
      }
    }
  }
  if (!draft.ok) {
    return {
      ok: false,
      error:
        'No hay cookie en el servidor. Usá Conectar Uber con correo y contraseña del portal, ejecutá la rutina Renovar cookie, o pegá el header Cookie.',
      tried,
    }
  }
  const prepared = prepareUberCookie(draft.value)
  if (!prepared.ok) return { ok: false, error: prepared.error }
  return { ok: true, value: prepared.value, source: draft.source, length: prepared.value.length }
}

export async function checkUberCookie({ cliHome, uberCli, cookieValue }) {
  const local = path.join(cliHome, '.uber_cookie')
  if (cookieValue && String(cookieValue).trim()) {
    const prepared = prepareUberCookie(cookieValue)
    if (!prepared.ok) return { ok: false, error: prepared.error }
    fs.mkdirSync(cliHome, { recursive: true })
    fs.writeFileSync(local, `${prepared.value}\n`, { mode: 0o600 })
    fs.chmodSync(local, 0o600)
  } else if (!fs.existsSync(local) || fs.statSync(local).size < 8) {
    return { ok: false, error: 'Falta cookie de Uber (traer o pegar una válida)' }
  }
  const health = await uberHealth(cliHome, uberCli)
  if (!health.ok) {
    return { ok: false, error: health.error || 'La cookie no sirve contra Uber (vencida o inválida)' }
  }
  const sample = health.stores_sample || []
  return { ok: true, stores: Array.isArray(sample) ? sample.length : sample, health }
}

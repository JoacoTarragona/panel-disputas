import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { preparePyaTokens, prepareUberCookie } from './engine/credentials.js'

const MAX_BODY = 16 * 1024
const FAIL_WINDOW_MS = 15 * 60 * 1000
const FAIL_MAX = 30
const failByIp = new Map()

function bearerToken(req) {
  const header = req.headers.authorization || ''
  if (!header.toLowerCase().startsWith('bearer ')) return ''
  return header.slice(7).trim()
}

function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function credentialsInjectionEnabled() {
  return Boolean(String(process.env.CREDENTIALS_API_TOKEN || '').trim())
}

export function isCredentialsRateLimited(ip) {
  const row = failByIp.get(ip)
  if (!row) return false
  if (Date.now() - row.at > FAIL_WINDOW_MS) {
    failByIp.delete(ip)
    return false
  }
  return row.count >= FAIL_MAX
}

export function recordCredentialsAuthFailure(ip) {
  const now = Date.now()
  const row = failByIp.get(ip)
  if (!row || now - row.at > FAIL_WINDOW_MS) {
    failByIp.set(ip, { count: 1, at: now })
    return
  }
  row.count += 1
}

export function authorizeCredentialsBearer(req) {
  if (!credentialsInjectionEnabled()) {
    return { ok: false, status: 503, error: 'Inyección de credenciales deshabilitada' }
  }
  const ip = clientIp(req)
  if (isCredentialsRateLimited(ip)) {
    return { ok: false, status: 429, error: 'Demasiados intentos' }
  }
  const token = bearerToken(req)
  const expected = String(process.env.CREDENTIALS_API_TOKEN || '').trim()
  if (!token || !safeEqual(token, expected)) {
    recordCredentialsAuthFailure(ip)
    return { ok: false, status: 401, error: 'No autorizado' }
  }
  return { ok: true }
}

export function readJsonBody(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(Object.assign(new Error('large'), { code: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(Object.assign(new Error('json'), { code: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function formatMtime(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(' ', 'T')
    .concat('-03:00')
}

function jwtExpiresIn(access) {
  try {
    const part = String(access || '').split('.')[1]
    if (!part) return null
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    if (typeof payload.exp !== 'number') return null
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
  } catch {
    return null
  }
}

function fileMeta(sessionsDir, name) {
  const file = path.join(sessionsDir, name)
  if (!fs.existsSync(file)) return { present: false }
  const stat = fs.statSync(file)
  if (stat.size === 0) return { present: false }
  return { present: true, mtime: formatMtime(stat.mtime), size: stat.size }
}

export function credentialStatusRich(sessionsDir) {
  const uber = fileMeta(sessionsDir, 'uber_cookie')
  const pya = fileMeta(sessionsDir, 'pya_tokens.json')
  if (pya.present) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(sessionsDir, 'pya_tokens.json'), 'utf8'))
      const left = jwtExpiresIn(parsed.access)
      if (left != null) pya.access_expires_in = left
    } catch {
      // estado del archivo sin parsear JWT
    }
  }
  return {
    ok: true,
    timezone: 'America/Santiago',
    uber,
    pya,
    pedidosya: pya.present ? 'configured' : 'missing',
  }
}

function runCli(command, args, env, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { timeout, env, cwd })
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
      if (code !== 0) {
        const text = (err || out).toLowerCase()
        if (text.includes('401') || text.includes('cookie') || text.includes('otp')) {
          return resolve({ ok: false, error: 'sin credencial' })
        }
        return resolve({ ok: false, error: (err || out || 'health').trim().slice(0, 200) || 'health' })
      }
      try {
        const rows = JSON.parse(out)
        if (Array.isArray(rows) && rows.length) {
          return resolve({ ok: true, stores_sample: rows.slice(0, 3).map((row) => row.name || row.store || row.id || 'tienda') })
        }
      } catch {
        // stdout no JSON
      }
      resolve({ ok: true })
    })
  })
}

export async function uberHealth(cliHome, uberCli) {
  const env = { ...process.env, HOME: cliHome }
  return runCli('python3', [uberCli, 'monitor', '--json'], env, path.dirname(uberCli))
}

export async function pyaHealth(cliHome, pyaCli, access) {
  const expiry = jwtExpiresIn(access)
  if (expiry != null && expiry <= 0) return { ok: false, error: 'access vencido', access_expires_in: 0 }
  const env = { ...process.env, HOME: cliHome }
  const remote = await runCli('python3', [pyaCli, 'monitor', '--json'], env, path.dirname(pyaCli))
  const health = { ok: remote.ok }
  if (expiry != null) health.access_expires_in = expiry
  if (remote.ok && remote.stores_sample) health.stores_sample = remote.stores_sample
  if (!remote.ok) health.error = remote.error || 'health'
  return health
}

export function preparePyaInjection(body) {
  if (body && typeof body === 'object' && typeof body.access === 'string' && typeof body.refresh === 'string') {
    return preparePyaTokens(JSON.stringify(body))
  }
  return { ok: false, error: 'Faltan access y refresh' }
}

export function sanitizeCredentialResponse(fields) {
  return fields
}

export { prepareUberCookie, preparePyaTokens, MAX_BODY }

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSubmit } from './engine/dispute-submit.js'
import { listDisputes } from './engine/dispute-list.js'
import { matchEvidence } from './engine/evidence-match.js'
import { preparePyaTokens, prepareUberCookie } from './engine/credentials.js'

const port = Number(process.env.PANEL_PORT || 8790)
const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../dist')
const sessionsDir = path.resolve(here, '../sessions')
const cliHome = path.join(sessionsDir, 'home')
const uberCli = process.env.UBER_CLI || '/home/dev/app-delivery/panel-delivery-fuentes/delivery-monitor-servidor/clients/uber/uber.py'
const pyaCli = process.env.PYA_CLI || '/home/dev/app-delivery/panel-delivery-fuentes/delivery-monitor-servidor/clients/pya/pya.py'
const sessions = new Set()

function same(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('json'))
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, body, extra = {}) {
  const raw = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': raw.length,
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(raw)
}

function cookieOf(req) {
  const header = req.headers.cookie || ''
  const found = header.split(';').map((part) => part.trim()).find((part) => part.startsWith('panel_session='))
  return found ? found.slice('panel_session='.length) : ''
}

function authorized(req) {
  return sessions.has(cookieOf(req))
}

async function evidenceList(aggregator, orderId) {
  const base = process.env.EVIDENCIA_URL || 'http://127.0.0.1:8787'
  const key = process.env.EVIDENCIA_READ_KEY || ''
  if (!key) return { status: 401, body: { error: 'sin credencial' } }
  const url = `${base}/v1/evidencia?agregador=${encodeURIComponent(aggregator)}&numero_orden=${encodeURIComponent(orderId)}`
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    const body = await response.json()
    if (response.status === 401) return { status: 401, body: { error: 'sin credencial' } }
    if (!response.ok) return { status: 502, body: { error: 'API caída' } }
    const matched = matchEvidence({
      aggregator,
      orderId,
      images: (body.images || []).map((image) => ({
        id: image.id,
        numero_orden: image.numero_orden,
        agregador: image.agregador,
      })),
    })
    return { status: 200, body: matched }
  } catch {
    return { status: 502, body: { error: 'API caída' } }
  }
}

function runJson(command, args, env, cwd, timeout) {
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
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        const text = err.toLowerCase()
        if (text.includes('403') || text.includes('perimeterx')) return resolve({ aviso: 'bloqueo anti-bot' })
        if (text.includes('401') || text.includes('otp') || text.includes('cookie')) return resolve({ aviso: 'sin credencial' })
        return resolve(null)
      }
      try {
        const rows = JSON.parse(out)
        if (!Array.isArray(rows)) return resolve(null)
        resolve({ rows, stderr: err })
      } catch {
        resolve(null)
      }
    })
  })
}

function fileReady(name) {
  const file = path.join(sessionsDir, name)
  return fs.existsSync(file) && fs.statSync(file).size > 0
}

function writePrivate(name, content) {
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(cliHome, { recursive: true })
  const file = path.join(sessionsDir, name)
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
  const linkName = name === 'uber_cookie' ? '.uber_cookie' : '.pya_tokens.json'
  const link = path.join(cliHome, linkName)
  try {
    fs.unlinkSync(link)
  } catch {
    // todavía no existe
  }
  fs.symlinkSync(file, link)
}

function credentialStatus() {
  return {
    uber: fileReady('uber_cookie') ? 'configured' : 'missing',
    pedidosya: fileReady('pya_tokens.json') ? 'configured' : 'missing',
  }
}

function money(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return null
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

function parseCounters(text) {
  const summary = {}
  for (const key of ['missed', 'canceled', 'disputeInProgress', 'disputeAccepted', 'disputeRejected', 'issueCharged', 'issueReported', 'potentialDeduction']) {
    const match = String(text || '').match(new RegExp(`${key}=(\\d+)`))
    if (match) summary[key] = Number(match[1])
  }
  return summary
}

function santiagoDate(daysAgo) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000))
}

const buckets = { pending: 'pendiente', disputed: 'abierta', accepted: 'ganada', rejected: 'perdida' }

async function loadUberStatus(env, estado, start) {
  const args = [uberCli, 'disputes', '--json', '--status', estado, '--max', '200']
  if (start) args.push('--start', start)
  const result = await runJson('python3', args, env, path.dirname(uberCli), 90000)
  if (result && Array.isArray(result.rows)) {
    return {
      ok: true,
      uber: result.rows.map((row) => ({
        order_id: String(row.order || row.order_id || ''),
        store: String(row.store || ''),
        requested: row.requested == null ? '' : String(row.requested),
        issue: String(row.issue || row.tag || ''),
        amount: money(row.chargeback ?? row.possible_chargeback ?? row.sales),
        state: String(row.issue || row.tag || estado),
        bucket: buckets[estado],
      })),
      summary: parseCounters(result.stderr),
    }
  }
  return { ok: false, aviso: `Uber: ${result && result.aviso ? result.aviso : 'API caída'}` }
}

async function loadUber(env, estado, start) {
  const statuses = estado === 'all' ? ['pending', 'disputed', 'accepted', 'rejected'] : [estado]
  const parts = await Promise.all(statuses.map((item) => loadUberStatus(env, item, start)))
  const ready = parts.filter((part) => part.ok)
  if (!ready.length) return parts[0]
  return {
    ok: true,
    uber: ready.flatMap((part) => part.uber),
    summary: Object.assign({}, ...ready.map((part) => part.summary)),
  }
}

async function loadPya(env, start) {
  const args = [pyaCli, 'orders', '--issues', '--json']
  if (start) args.push('--start', start)
  const orders = await runJson('python3', args, env, path.dirname(pyaCli), 45000)
  if (orders && Array.isArray(orders.rows)) {
    return {
      ok: true,
      pyaOrders: orders.rows.map((row) => ({
        order_id: String(row.order_id || ''),
        store: String(row.store || ''),
        requested: row.placed == null ? '' : String(row.placed),
        issue: String(row.issues || ''),
        amount: money(row.fees_deductions),
        disputeStatus: String(row.issues || row.status || 'reclamo'),
        bucket: 'pendiente',
      })),
    }
  }
  return { ok: false, aviso: `PedidosYa: ${orders && orders.aviso ? orders.aviso : 'API caída'}` }
}

function failPart(part) {
  const aviso = part.aviso || ''
  if (aviso.includes('bloqueo anti-bot')) return { blocked: true }
  if (aviso.includes('sin credencial')) return { auth: false }
  return null
}

async function readSources(agregador, estado, dias) {
  const status = credentialStatus()
  const env = { ...process.env, HOME: cliHome }
  const days = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30
  const start = santiagoDate(days)
  const window = { from: start, to: santiagoDate(0), timezone: 'America/Santiago' }
  if (agregador === 'pedidosya') {
    if (status.pedidosya !== 'configured') return { missing: true }
    const part = await loadPya(env, start)
    if (!part.ok) return failPart(part)
    return { uber: [], pyaOrders: part.pyaOrders, pyaIssues: [], window }
  }
  if (status.uber !== 'configured') return { missing: true }
  const selected = ['pending', 'disputed', 'accepted', 'rejected', 'all'].includes(estado) ? estado : 'pending'
  const part = await loadUber(env, selected, start)
  if (!part.ok) return failPart(part)
  return { uber: part.uber, pyaOrders: [], pyaIssues: [], summary: part.summary, window }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const pathname = url.pathname
  console.log(`${req.method} ${pathname}`)

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req)
    const ok = same(String(body.user || ''), 'demo') && same(String(body.password || ''), 'demo')
    if (!ok) return send(res, 401, { error: 'sin credencial' })
    const token = crypto.randomBytes(24).toString('hex')
    sessions.add(token)
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `panel_session=${token}; HttpOnly; Path=/; SameSite=Lax`,
    })
  }

  if (pathname.startsWith('/api/') && !authorized(req)) {
    return send(res, 401, { error: 'sin credencial' })
  }

  if (req.method === 'GET' && pathname === '/api/credentials/status') {
    return send(res, 200, credentialStatus())
  }

  if (req.method === 'PUT' && (pathname === '/api/credentials/uber' || pathname === '/api/credentials/pedidosya')) {
    const body = await readBody(req)
    const source = pathname.endsWith('/uber') ? 'uber' : 'pedidosya'
    const prepared = source === 'uber'
      ? prepareUberCookie(String(body.value || ''))
      : preparePyaTokens(String(body.value || ''))
    if (!prepared.ok) return send(res, 400, { error: prepared.error })
    writePrivate(source === 'uber' ? 'uber_cookie' : 'pya_tokens.json', prepared.value)
    return send(res, 200, { ok: true, ...credentialStatus() })
  }

  if (req.method === 'GET' && pathname === '/api/disputes') {
    const agregador = url.searchParams.get('agregador') === 'pedidosya' ? 'pedidosya' : 'uber'
    const estado = url.searchParams.get('estado') || 'pending'
    const loaded = await readSources(agregador, estado, url.searchParams.get('dias'))
    if (loaded && loaded.missing) return send(res, 401, { error: 'sin credencial' })
    if (loaded && loaded.auth === false) return send(res, 401, { error: 'sin credencial' })
    if (loaded && loaded.blocked) return send(res, 502, { error: 'bloqueo anti-bot' })
    if (!loaded || loaded.missing) return send(res, 502, { error: 'API caída' })
    const result = listDisputes(loaded)
    if (loaded.window) result.window = loaded.window
    console.log(`GET /api/disputes ${agregador} ${estado} 200 filas=${result.rows.length}`)
    return send(res, 200, result)
  }

  if (req.method === 'POST' && pathname === '/api/evidencia') {
    const body = await readBody(req)
    const result = await evidenceList(String(body.agregador || ''), String(body.numero_orden || ''))
    return send(res, result.status, result.body)
  }

  if (req.method === 'GET' && pathname.startsWith('/api/evidencia/') && pathname.endsWith('/imagen')) {
    const id = pathname.split('/')[3]
    const base = process.env.EVIDENCIA_URL || 'http://127.0.0.1:8787'
    const key = process.env.EVIDENCIA_READ_KEY || ''
    if (!key) return send(res, 401, { error: 'sin credencial' })
    try {
      const response = await fetch(`${base}/v1/evidencia/${encodeURIComponent(id)}/imagen`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) return send(res, 404, { error: 'No hay imagen de ese pedido' })
      const blob = Buffer.from(await response.arrayBuffer())
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': blob.length,
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
      })
      return res.end(blob)
    } catch {
      return send(res, 502, { error: 'API caída' })
    }
  }

  if (req.method === 'POST' && (pathname === '/api/disputas/armar' || pathname === '/api/disputas/enviar')) {
    const body = await readBody(req)
    const aggregator = body.agregador
    if (aggregator !== 'uber' && aggregator !== 'pedidosya' && aggregator !== 'rappi') {
      return send(res, 400, { error: 'Falta un agregador válido' })
    }
    const evidenceIds = Array.isArray(body.evidence_ids) ? body.evidence_ids.map(String).filter(Boolean) : []
    if (!evidenceIds.length) return send(res, 400, { error: 'No hay imagen de ese pedido' })
    const result = buildSubmit({
      aggregator,
      orderId: String(body.numero_orden || ''),
      evidenceIds,
      confirm: false,
    })
    if (result.aggregator === 'pedidosya') {
      return send(res, 501, { error: 'no disponible', simulatedSuccess: false })
    }
    if (result.aggregator === 'rappi') {
      return send(res, 200, { message: 'sin conexión' })
    }
    const armed = pathname.endsWith('/armar')
    return send(res, 200, {
      message: armed ? 'Request armado' : 'dry-run',
      dryRun: true,
      calledWrite: false,
      request: result.request,
    })
  }

  const filePath = pathname === '/' || pathname === '/disputas'
    ? path.join(dist, 'index.html')
    : path.join(dist, pathname)
  if (!filePath.startsWith(dist) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const fallback = path.join(dist, 'index.html')
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fs.readFileSync(fallback))
    }
    return send(res, 404, { error: 'no encontrado' })
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' })
  res.end(fs.readFileSync(filePath))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`panel escuchando en 127.0.0.1:${port}`)
})

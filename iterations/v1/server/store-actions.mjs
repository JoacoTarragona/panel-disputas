import { spawn } from 'node:child_process'
import path from 'node:path'

function runCli(script, args, cliHome, timeout = 120000) {
  return new Promise((resolve) => {
    const child = spawn(process.env.PYTHON || 'python3', [script, ...args], {
      env: { ...process.env, HOME: cliHome },
      cwd: path.dirname(script),
      timeout,
    })
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
      if (args.includes('soldout-report')) {
        try {
          const rows = JSON.parse(out)
          if (Array.isArray(rows)) {
            return resolve({ ok: true, items: rows })
          }
        } catch {
          // continuar con stderr
        }
      }
      const text = (err || out).trim()
      if (code !== 0) {
        const low = text.toLowerCase()
        if (low.includes('sin credencial') || low.includes('cookie') || low.includes('401')) {
          return resolve({ ok: false, error: 'sin credencial' })
        }
        return resolve({ ok: false, error: text.slice(0, 240) || 'API caída' })
      }
      return resolve({ ok: true, message: text.split('\n').slice(-2).join(' ').slice(0, 200) })
    })
  })
}

function cliFor(agregador, uberCli, pyaCli) {
  if (agregador === 'rappi') return null
  return agregador === 'pedidosya' ? pyaCli : uberCli
}

function storeArgs(storeId, name) {
  const args = []
  if (storeId) args.push('--id', storeId)
  else if (name) args.push('-s', name)
  return args
}

export async function openStore(agregador, cliHome, uberCli, pyaCli, storeId, name) {
  const script = cliFor(agregador, uberCli, pyaCli)
  if (!script) return { ok: false, error: 'sin conexion' }
  const extra = storeArgs(storeId, name)
  if (!extra.length) return { ok: false, error: 'Falta el local' }
  return runCli(script, ['activate', '--yes', ...extra], cliHome)
}

export async function closeStore(agregador, cliHome, uberCli, pyaCli, storeId, name) {
  const script = cliFor(agregador, uberCli, pyaCli)
  if (!script) return { ok: false, error: 'sin conexion' }
  const extra = storeArgs(storeId, name)
  if (!extra.length) return { ok: false, error: 'Falta el local' }
  const pauseArgs =
    agregador === 'pedidosya'
      ? ['pause', '--yes', ...extra]
      : ['pause', '--yes', '--duration', 'rest_of_day', '--reason', 'OTHER', ...extra]
  return runCli(script, pauseArgs, cliHome)
}

export async function soldoutReport(agregador, cliHome, uberCli, pyaCli, storeId, name) {
  const script = cliFor(agregador, uberCli, pyaCli)
  if (!script) return { ok: false, error: 'sin conexion', items: [] }
  const extra = storeArgs(storeId, name)
  const result = await runCli(script, ['soldout-report', '--json', ...extra], cliHome, 180000)
  if (!result.ok) return { ...result, items: [] }
  const items = (result.items || []).map((row) => ({
    store: row.store || '',
    item: row.item || row.product || '',
    until: row.until_chile || row.until || '',
  }))
  return { ok: true, count: items.length, items }
}

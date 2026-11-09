import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const opsScript = path.join(repoRoot, 'operations', 'panel_ops.py')

function spawnOps(command, agregador, envExtra, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(
      process.env.PYTHON || 'python3',
      [opsScript, command, '--agregador', agregador, ...extraArgs],
      {
        env: { ...process.env, ...envExtra },
        cwd: repoRoot,
      },
    )
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
      try {
        const body = JSON.parse(out || '{}')
        if (code !== 0 && !body.error) body.error = 'API caída'
        resolve(body)
      } catch {
        resolve({ ok: false, error: err.trim() || 'API caída' })
      }
    })
  })
}

export async function opsEnsureDb(cliHome) {
  return spawnOps('init', 'uber', { OPS_CLI_HOME: cliHome })
}

export async function opsRefresh(agregador, cliHome) {
  if (agregador === 'rappi') {
    return { ok: false, error: 'sin conexion', locales: [], agregador: 'rappi' }
  }
  return spawnOps('sample', agregador, { OPS_CLI_HOME: cliHome })
}

export async function opsResumen(agregador, cliHome, query = {}) {
  if (agregador === 'rappi') {
    return {
      agregador: 'rappi',
      disponibilidad: null,
      muestras: 0,
      totales_min: {},
      serie: [],
      motivos: [],
      error: 'sin conexion',
    }
  }
  const extra = []
  if (query.desde) extra.push('--desde', query.desde)
  if (query.hasta) extra.push('--hasta', query.hasta)
  if (query.agrupar) extra.push('--agrupar', query.agrupar)
  return spawnOps('resumen', agregador, { OPS_CLI_HOME: cliHome }, extra)
}

export async function opsLive(agregador, cliHome) {
  if (agregador === 'rappi') {
    return { ok: false, error: 'sin conexion', locales: [] }
  }
  return spawnOps('live', agregador, { OPS_CLI_HOME: cliHome })
}

export type Prepared =
  | { ok: true; value: string }
  | { ok: false; error: string }

export function prepareUberCookie(raw: string): Prepared {
  let text = raw.trim()
  if (text.toLowerCase().startsWith('cookie:')) text = text.slice(text.indexOf(':') + 1).trim()
  if (!text || text.includes('\n') || !text.includes('=')) {
    return { ok: false, error: 'La cookie debe ser el header Cookie en una sola línea' }
  }
  return { ok: true, value: text }
}

export function preparePyaTokens(raw: string): Prepared {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'pya_tokens.json no es JSON válido' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'pya_tokens.json debe ser un objeto' }
  }
  const record = data as Record<string, unknown>
  if (typeof record.access !== 'string' && typeof record.refresh !== 'string') {
    return { ok: false, error: 'pya_tokens.json debe traer access y/o refresh' }
  }
  const kept: Record<string, string> = {}
  for (const key of ['access', 'refresh', 'device'] as const) {
    if (typeof record[key] === 'string' && record[key]) kept[key] = record[key]
  }
  return { ok: true, value: JSON.stringify(kept) }
}

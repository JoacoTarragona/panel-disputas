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

const MAX_CREDENTIAL = 65536

export function injectCredentials(input: { uber?: unknown; pedidosya?: unknown }):
  | { ok: true; uber?: string; pedidosya?: string }
  | { ok: false; error: string } {
  const hasUber = input.uber !== undefined && input.uber !== null && input.uber !== ''
  const hasPya = input.pedidosya !== undefined && input.pedidosya !== null && input.pedidosya !== ''
  if (!hasUber && !hasPya) return { ok: false, error: 'Falta la credencial' }
  const prepared: { uber?: string; pedidosya?: string } = {}
  if (hasUber) {
    if (typeof input.uber !== 'string' || input.uber.length > MAX_CREDENTIAL) {
      return { ok: false, error: 'La cookie debe ser el header Cookie en una sola línea' }
    }
    const uber = prepareUberCookie(input.uber)
    if (!uber.ok) return uber
    prepared.uber = uber.value
  }
  if (hasPya) {
    const raw = typeof input.pedidosya === 'string' ? input.pedidosya : JSON.stringify(input.pedidosya)
    if (raw.length > MAX_CREDENTIAL) return { ok: false, error: 'pya_tokens.json no es JSON válido' }
    const pya = preparePyaTokens(raw)
    if (!pya.ok) return pya
    prepared.pedidosya = pya.value
  }
  return { ok: true, ...prepared }
}

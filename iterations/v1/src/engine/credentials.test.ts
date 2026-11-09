import { describe, expect, it } from 'vitest'
import { injectCredentials, preparePyaTokens, prepareUberCookie } from './credentials'

describe('credentials', () => {
  it('acepta una cookie de una línea y rechaza un párrafo', () => {
    expect(prepareUberCookie('Cookie: sid=abc').ok).toBe(true)
    expect(prepareUberCookie('sin pares').ok).toBe(false)
  })

  it('guarda solo access, refresh y device', () => {
    const result = preparePyaTokens('{"access":"A","refresh":"R","extra":"no"}')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(JSON.parse(result.value)).toEqual({ access: 'A', refresh: 'R' })
  })

  it('rechaza un json sin tokens', () => {
    expect(preparePyaTokens('{"hola":1}').ok).toBe(false)
  })

  it('inyecta uber y pedidosya sin conservar campos de más', () => {
    const result = injectCredentials({
      uber: 'Cookie: sid=abc',
      pedidosya: { access: 'A', refresh: 'R', extra: 'no' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.uber).toBe('sid=abc')
    expect(JSON.parse(result.pedidosya || '{}')).toEqual({ access: 'A', refresh: 'R' })
  })

  it('no inyecta si el cuerpo viene vacío', () => {
    expect(injectCredentials({}).ok).toBe(false)
  })
})

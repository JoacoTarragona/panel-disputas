import { describe, expect, it } from 'vitest'
import { preparePyaTokens, prepareUberCookie } from './credentials'

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
})

import { describe, expect, it } from 'vitest'
import { remainingWait } from './wait'

describe('wait', () => {
  it('sostiene la carga hasta 3 segundos', () => {
    expect(remainingWait(1_000, 1_500)).toBe(2500)
    expect(remainingWait(1_000, 5_000)).toBe(0)
  })
})

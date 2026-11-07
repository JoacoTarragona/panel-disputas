import { describe, expect, it } from 'vitest'
import { matchEvidence, NO_IMAGE } from './evidence-match'

describe('evidence-match', () => {
  it('el pedido 15 no muestra fotos del 16', () => {
    const result = matchEvidence({
      aggregator: 'uber',
      orderId: '15',
      images: [
        { id: 'a', numero_orden: '16', agregador: 'uber' },
        { id: 'b', numero_orden: '15', agregador: 'pedidosya' },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.images).toEqual([])
    expect(result.warning).toBe(NO_IMAGE)
  })

  it('devuelve solo las fotos de ese número y ese agregador', () => {
    const result = matchEvidence({
      aggregator: 'uber',
      orderId: '15',
      images: [
        { id: 'old', numero_orden: '15', agregador: 'uber' },
        { id: 'other', numero_orden: '16', agregador: 'uber' },
        { id: 'new', numero_orden: '15', agregador: 'uber' },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.images.map((image) => image.id)).toEqual(['old', 'new'])
  })

  it('Rappi no busca', () => {
    const result = matchEvidence({
      aggregator: 'rappi',
      orderId: '15',
      images: [{ id: 'a', numero_orden: '15', agregador: 'rappi' }],
    })
    expect(result.images).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { buildSubmit } from './dispute-submit'

describe('dispute-submit', () => {
  it('arma el request con la imagen y sin escribir', () => {
    const result = buildSubmit({ aggregator: 'uber', orderId: '88', evidenceIds: ['img-1'], confirm: false })
    expect(result.aggregator).toBe('uber')
    if (result.aggregator !== 'uber') return
    expect(result.request.evidence_ids).toEqual(['img-1'])
    expect(result.calledWrite).toBe(false)
    expect(result.dryRun).toBe(true)
  })

  it('Uber sin confirm queda en dry-run y no escribe', () => {
    const result = buildSubmit({ aggregator: 'uber', orderId: '88', reason: 'falta' })
    expect(result.aggregator).toBe('uber')
    if (result.aggregator !== 'uber') return
    expect(result.dryRun).toBe(true)
    expect(result.calledWrite).toBe(false)
    expect(result.request.confirm).toBe(false)
  })

  it('PedidosYa responde 501 y no simula éxito', () => {
    expect(buildSubmit({ aggregator: 'pedidosya', orderId: 'PY-9' })).toEqual({
      aggregator: 'pedidosya',
      status: 501,
      simulatedSuccess: false,
    })
  })

  it('Rappi no llama', () => {
    expect(buildSubmit({ aggregator: 'rappi', orderId: '1' })).toEqual({
      aggregator: 'rappi',
      called: false,
    })
  })
})

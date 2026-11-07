import { describe, expect, it } from 'vitest'
import { listDisputes } from './dispute-list'

describe('dispute-list', () => {
  it('no cuenta un reclamo de PedidosYa como disputa sin abrir', () => {
    const result = listDisputes({
      uber: [{ order_id: '88', state: 'pending' }],
      pyaIssues: [{ id: 'a' }, { id: 'b' }],
    })
    expect(result.unopenedCount).toBe(1)
    expect(result.complaintCount).toBe(2)
    expect(result.rows.map((row) => row.orderId)).toEqual(['88'])
    expect(result.rappi).toBe('sin conexion')
  })

  it('muestra un pedido PedidosYa con estado de disputa y no lo suma a los reclamos', () => {
    const result = listDisputes({
      pyaOrders: [{ order_id: 'PY-9', isDisputeAllowed: true, disputeStatus: 'abierta' }],
      pyaIssues: [{ id: 'reclamo' }],
    })
    expect(result.rows).toEqual([
      {
        orderId: 'PY-9',
        aggregator: 'pedidosya',
        status: 'abierta',
        hasAttachedImage: false,
      },
    ])
    expect(result.unopenedCount).toBe(0)
    expect(result.complaintCount).toBe(1)
  })

  it('arma el tablero con los contadores de la misma consulta', () => {
    const result = listDisputes({
      uber: [
        { order_id: 'D80C3', store: 'Tarragona - El Llano', amount: 5000, bucket: 'pendiente' },
        { order_id: '76657', store: 'Tarragona - El Llano', amount: 3990, bucket: 'pendiente' },
      ],
      summary: {
        issueCharged: 825,
        potentialDeduction: 0,
        disputeInProgress: 3,
        disputeAccepted: 29,
        disputeRejected: 7,
        issueReported: 253,
        missed: 134,
        canceled: 41,
      },
    })
    expect(result.summary.pending).toBe(825)
    expect(result.summary.open).toBe(3)
    expect(result.summary.won).toBe(29)
    expect(result.summary.lost).toBe(7)
    expect(result.summary.pendingAmount).toBe(8990)
    expect(result.topStores).toEqual([{ store: 'Tarragona - El Llano', count: 2 }])
  })
})

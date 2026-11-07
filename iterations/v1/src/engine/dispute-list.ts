export type DisputeBucket = 'pendiente' | 'abierta' | 'ganada' | 'perdida'

export type DisputeRow = {
  orderId: string
  aggregator: 'uber' | 'pedidosya'
  status: string
  hasAttachedImage: boolean
  store?: string
  requested?: string
  issue?: string
  amount?: number | null
  bucket?: DisputeBucket
}

export type UberDispute = {
  order_id: string
  state?: string
  has_image?: boolean
  store?: string
  requested?: string
  issue?: string
  amount?: number | null
  bucket?: DisputeBucket
}

export type UberSummary = {
  missed?: number
  canceled?: number
  disputeInProgress?: number
  disputeAccepted?: number
  disputeRejected?: number
  issueCharged?: number
  issueReported?: number
  potentialDeduction?: number
}

export type BoardSummary = {
  pending: number
  open: number
  won: number
  lost: number
  reported: number
  missed: number
  canceled: number
  pendingAmount: number
}

export type PyaOrder = {
  order_id: string
  isDisputeAllowed?: boolean
  disputeStatus?: string | null
  has_image?: boolean
  store?: string
  requested?: string
  issue?: string
  amount?: number | null
  bucket?: DisputeBucket
}

export type ListResult = {
  rows: DisputeRow[]
  unopenedCount: number
  complaintCount: number
  rappi: 'sin conexion'
  summary: BoardSummary
  topStores: { store: string; count: number }[]
}

function withDetail(row: DisputeRow, source: { store?: string; requested?: string; issue?: string; amount?: number | null; bucket?: DisputeBucket }): DisputeRow {
  if (source.store) row.store = source.store
  if (source.requested) row.requested = source.requested
  if (source.issue) row.issue = source.issue
  if (source.amount != null) row.amount = source.amount
  if (source.bucket) row.bucket = source.bucket
  return row
}

export function listDisputes(input: {
  uber?: UberDispute[]
  pyaOrders?: PyaOrder[]
  pyaIssues?: unknown[]
  summary?: UberSummary
}): ListResult {
  const uber = input.uber ?? []
  const orders = input.pyaOrders ?? []
  const issues = input.pyaIssues ?? []
  const rows: DisputeRow[] = []

  for (const row of uber) {
    if (!row.order_id) continue
    rows.push(withDetail({
      orderId: row.order_id,
      aggregator: 'uber',
      status: row.state || 'pending',
      hasAttachedImage: row.has_image === true,
    }, row))
  }

  for (const row of orders) {
    if (!row.order_id) continue
    if (!row.isDisputeAllowed && !row.disputeStatus) continue
    rows.push(withDetail({
      orderId: row.order_id,
      aggregator: 'pedidosya',
      status: row.disputeStatus || 'permitida',
      hasAttachedImage: row.has_image === true,
    }, row))
  }

  const counted = input.summary
  const pendingRows = rows.filter((row) => (row.bucket || 'pendiente') === 'pendiente')
  const fromCounter = (counted?.issueCharged || 0) + (counted?.potentialDeduction || 0)
  const pendingAmount = pendingRows.reduce((sum, row) => sum + (row.amount || 0), 0)
  const stores = new Map<string, number>()
  for (const row of pendingRows) {
    if (!row.store) continue
    stores.set(row.store, (stores.get(row.store) || 0) + 1)
  }

  return {
    rows,
    unopenedCount: uber.filter((row) => row.order_id).length,
    complaintCount: issues.length,
    rappi: 'sin conexion',
    summary: {
      pending: fromCounter || pendingRows.length,
      open: counted?.disputeInProgress || 0,
      won: counted?.disputeAccepted || 0,
      lost: counted?.disputeRejected || 0,
      reported: counted?.issueReported || 0,
      missed: counted?.missed || 0,
      canceled: counted?.canceled || 0,
      pendingAmount,
    },
    topStores: [...stores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([store, count]) => ({ store, count })),
  }
}

export type SubmitResult =
  | {
      aggregator: 'uber'
      dryRun: boolean
      calledWrite: boolean
      request: {
        path: string
        workflow: string
        restaurant: string
        reason: string
        description?: string
        evidence_ids: string[]
        confirm: boolean
      }
    }
  | { aggregator: 'pedidosya'; status: 501; simulatedSuccess: false }
  | { aggregator: 'rappi'; called: false }

export function buildSubmit(input: {
  aggregator: 'uber' | 'pedidosya' | 'rappi'
  orderId: string
  workflow?: string
  restaurant?: string
  reason?: string
  description?: string
  evidenceIds?: string[]
  confirm?: boolean
}): SubmitResult {
  if (input.aggregator === 'pedidosya') {
    return { aggregator: 'pedidosya', status: 501, simulatedSuccess: false }
  }
  if (input.aggregator === 'rappi') {
    return { aggregator: 'rappi', called: false }
  }
  const confirm = input.confirm === true
  return {
    aggregator: 'uber',
    dryRun: !confirm,
    calledWrite: confirm,
    request: {
      path: `/api/disputes/uber/${input.orderId}/submit`,
      workflow: input.workflow ?? '',
      restaurant: input.restaurant ?? '',
      reason: input.reason ?? '',
      description: input.description,
      evidence_ids: input.evidenceIds ?? [],
      confirm,
    },
  }
}

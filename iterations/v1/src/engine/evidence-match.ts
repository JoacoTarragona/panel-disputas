export const NO_IMAGE = 'No hay imagen de ese pedido'

export type EvidenceImage = {
  id: string
  numero_orden: string
  agregador: string
}

export type MatchResult =
  | { ok: true; images: EvidenceImage[] }
  | { ok: false; warning: typeof NO_IMAGE; images: [] }

export function matchEvidence(input: {
  aggregator: string
  orderId: string
  images: EvidenceImage[]
}): MatchResult {
  if (input.aggregator === 'rappi') {
    return { ok: false, warning: NO_IMAGE, images: [] }
  }
  const images = input.images.filter(
    (image) => image.numero_orden === input.orderId && image.agregador === input.aggregator,
  )
  if (images.length === 0) {
    return { ok: false, warning: NO_IMAGE, images: [] }
  }
  return { ok: true, images }
}

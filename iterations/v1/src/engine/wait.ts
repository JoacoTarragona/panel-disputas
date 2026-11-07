export const MIN_LOAD_MS = 3000

export function remainingWait(startedAt: number, now: number, minMs = MIN_LOAD_MS): number {
  return Math.max(0, minMs - (now - startedAt))
}

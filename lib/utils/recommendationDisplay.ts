import { formatFrequency } from '@/lib/utils/pitchUtils'
import type { PEQRecommendation, ShelfRecommendation } from '@/types/advisory'

export function getRecommendationStrategyLabel(
  peq: PEQRecommendation | null | undefined,
): string | null {
  if (!peq) return null
  return peq.strategy === 'broad-region' ? 'Broad Region' : 'Narrow Cut'
}

export function formatShelfRecommendationShort(
  shelf: ShelfRecommendation,
): string {
  switch (shelf.type) {
    case 'HPF':
      return `HPF at ${formatFrequency(shelf.hz)} for rumble`
    case 'LPF':
      return `LPF at ${formatFrequency(shelf.hz)} for top-end spill`
    case 'lowShelf':
      return `Low shelf ${shelf.gainDb}dB @ ${formatFrequency(shelf.hz)}`
    case 'highShelf':
      return `High shelf ${shelf.gainDb}dB @ ${formatFrequency(shelf.hz)}`
    default:
      return `${shelf.type} @ ${formatFrequency(shelf.hz)}`
  }
}

export function summarizeShelfRecommendations(
  shelves: readonly ShelfRecommendation[] | null | undefined,
): string | null {
  if (!shelves || shelves.length === 0) return null

  const summary = shelves
    .slice(0, 2)
    .map((shelf) => formatShelfRecommendationShort(shelf))
    .join(' | ')

  if (shelves.length <= 2) {
    return summary
  }

  return `${summary} | +${shelves.length - 2} more`
}

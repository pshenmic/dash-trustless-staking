import type { VoteOutcome } from '../../lib/types'

/** Semantic outcome colors: YES green, NO red, ABSTAIN neutral. Validated for light + dark chart
 *  surfaces; colorblind WARNs are covered by the direct YES/NO/ABSTAIN labels on every mark. */
export const OUTCOME_HEX: Record<VoteOutcome, string> = { 1: '#16a34a', 2: '#e11d48', 3: '#6b7280' }
export const OUTCOME_LABEL: Record<VoteOutcome, string> = { 1: 'YES', 2: 'NO', 3: 'ABSTAIN' }
export const OUTCOME_TEXT: Record<VoteOutcome, string> = { 1: 'text-mint-ink', 2: 'text-red-ink', 3: 'text-muted' }
/** Single-letter glyph for dense grids; the full word stays in the tooltip */
export const OUTCOME_LETTER: Record<VoteOutcome, string> = { 1: 'Y', 2: 'N', 3: 'A' }
/** Soft surface + ink pair for compact chips, on both the light and dark theme */
export const OUTCOME_CHIP: Record<VoteOutcome, string> = {
  1: 'bg-mint-soft text-mint-ink',
  2: 'bg-red-soft text-red-ink',
  3: 'bg-surface-2 text-muted'
}
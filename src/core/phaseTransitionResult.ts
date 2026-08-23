import type { BattleActionFeedback } from './battleActionFeedback';

/**
 * Call-scoped outcome of one `PhaseManager.transition()`.
 *
 * Reports acceptance and transient battle feedback — nothing else. It carries no
 * pipeline classification (navigation vs mutation) and no `GamePhase`: routing
 * decisions belong exclusively to `phaseTransitionResolver`, and render state
 * comes exclusively from `PhaseManager.getPhase()`.
 */
export type PhaseTransitionResult =
  | { status: 'rejected' }
  | { status: 'applied'; battleFeedback: BattleActionFeedback | null };

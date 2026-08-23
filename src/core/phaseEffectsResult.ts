import type { BattleActionFeedback } from './battleActionFeedback';

/**
 * Transient output of one `applyActionSideEffects()` call.
 *
 * Internal to the transition pipeline — never stored on the coordinator, never
 * exposed to scenes. Carries only information that cannot be recovered from
 * authoritative state: no phase snapshots, no runtime state, no stores, no
 * lifecycle flags.
 */
export interface PhaseEffectsResult {
  readonly battleFeedback: BattleActionFeedback | null;
}

/**
 * Shared "this branch produced no transient feedback" value.
 *
 * Frozen and shared so the many non-battle effect branches cannot drift into
 * inventing their own shape, and so hot branches like `battle_preview_target`
 * (fired on pointer move) allocate nothing.
 */
export const NO_PHASE_EFFECTS: PhaseEffectsResult = Object.freeze({ battleFeedback: null });

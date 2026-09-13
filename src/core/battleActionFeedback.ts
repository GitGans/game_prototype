import type { Side } from '../shared/gridTypes';
import type { BattleEvent } from '../battle/battleEvents';

/**
 * Public projection of `TurnStartDirective` (battle/turnResolver).
 *
 * Deliberately omits `activeSkill` (an internal `ActionSkillDefinition`) and
 * `validTargets` — the latter is the SAME array reference installed into
 * `BattleState.validTargets`, so forwarding it would hand a scene a live handle
 * into committed battle state. Scenes read valid targets from `GamePhase`.
 *
 * Variant names and payload field names mirror the internal type exactly, so
 * `mapDirectiveToPresentationInput()` consumes this without a body change.
 */
export type BattleTurnDirectiveFeedback =
  | { type: 'none'; reason: 'battle_ended' | 'quick_mode' | 'empty_queue' }
  | { type: 'continue_immediately' }
  | { type: 'schedule_auto_turn'; activeUnitId: string; delayKind: 'auto_player' | 'auto_enemy' }
  | { type: 'await_manual_target'; activeUnitId: string; promptKind: 'attack' | 'heal' }
  /** Manual turn whose selected skill has no valid targets: action bar, no targeting prompt. */
  | { type: 'await_manual_action'; activeUnitId: string };

/**
 * Public projection of `AutoTurnIntention` — the two fields a scene reads
 * (animation target, presentation style hint).
 *
 * The authoritative `AutoTurnIntention` stays in `battleRuntimeContext.ts`:
 * `PhaseManager` stores that exact object into `runtime.pendingAutoTurnIntention`,
 * so exposing it would alias runtime state. The scene never re-supplies an
 * intention — `battle_apply_auto_turn` carries no payload and reads the pending
 * intention from the runtime.
 */
export interface AutoTurnIntentionFeedback {
  unitId:         string;
  activeUnitSide: Side;
}

/**
 * What a successful in-battle item activation produced. `applied` is explicit rather than
 * implied by the field's presence, so a scene schedules the next turn only after a real use
 * and never off a rejected click.
 */
export interface BattleItemUseFeedback {
  readonly applied: boolean;
  readonly itemName: string;
  readonly restoredHp: number;
}

export type BattleAutoTurnDirectiveFeedback =
  | { type: 'none'; reason: 'battle_ended' | 'non_auto_mode' }
  | { type: 'handoff_manual' }
  | { type: 'restart_turn' }
  | { type: 'intention'; intention: AutoTurnIntentionFeedback; animateAttack: boolean };

/**
 * Transient presentation/control output of one battle turn action.
 *
 * NOT render state — render state comes from `GamePhase` only. Shares no object
 * reference with `BattleState`, `TurnContext`, `BattleRuntimeContext`, or the
 * handler result, at any depth. Belongs to the single `PhaseManager.transition()`
 * invocation that produced it and must not be retained across transitions.
 */
export interface BattleActionFeedback {
  events:             BattleEvent[];
  directive?:         BattleTurnDirectiveFeedback;
  winner?:            Side;
  autoTurnDirective?: BattleAutoTurnDirectiveFeedback;
  autoTurnApplied?:   boolean;
  itemUse?:           BattleItemUseFeedback;
}

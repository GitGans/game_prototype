import { GameState } from '../GameState';
import type { GamePhase, PhaseAction } from '../phases';
import type { BattleExitOutcome } from '../battleRuntimeContext';
import { requireBattleRuntimeForPhase } from '../battleRuntimeAccess';
import {
  applyMovePartyToCampaign,
  applyEncounterDefeatedToCampaign,
} from '../campaignWorldTransitions';

/**
 * The application seam for world-state mutations: resolve storage → delegate the rule →
 * write once. Like its sibling handlers (`inventoryPhaseHandler`, `campPhaseHandler`,
 * `progressionPhaseHandler`) it owns no rules of its own — every transformation lives in the
 * pure `campaignWorldTransitions.ts`.
 */

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

/**
 * The only mutation point for `move_party`. Writes `CampaignState.world.partyPos`; the phase
 * itself never carries the party position, which is why `resolveTransition` classifies
 * `move_party` as mutation-only.
 */
export function applyMovePartyPhaseAction(
  action: Extract<PhaseAction, { type: 'move_party' }>,
): void {
  GameState.setCampaignState(
    applyMovePartyToCampaign(GameState.getCampaignState(), action.partyPos),
  );
}

/**
 * The campaign-only world consequence of leaving a battle, and the single `sessionSource`-keyed
 * branch in teardown. Victory only: a defeat must leave the encounter intact so it can be
 * retried.
 *
 * This operation resolves and validates the battle runtime ITSELF and branches on
 * `runtime.sessionSource`, exactly as the pre-extraction inline block did. It deliberately does
 * not trust an earlier caller to have validated: every authoritative battle consequence checks
 * runtime-vs-phase within its own operation, so this owner stays correct when invoked
 * independently and a mismatch throws BEFORE any campaign mutation. During `exit_battle` this
 * repeats the lookup `applyBattleExitRosterEffect` just performed — an intentional, cheap
 * redundancy in exchange for removing a hidden temporal dependency between two independently
 * exported owners.
 *
 * The runtime is resolved before the outcome/source guards so a corrupted runtime throws even on
 * a defeat exit. That matches the old inline code, which resolved the runtime unconditionally
 * for every `exit_battle` one line before checking the outcome.
 *
 * `mapCleared` derivation is NOT here: it belongs to `phaseTransitionMetadata` and runs before
 * any effect, because the pure resolver needs it to choose the next phase.
 */
export function applyBattleWorldConsequence(input: {
  previousPhase: BattlePhase;
  outcome: BattleExitOutcome;
}): void {
  const { previousPhase, outcome } = input;
  const runtime = requireBattleRuntimeForPhase(previousPhase);

  if (outcome !== 'victory') return;
  if (runtime.sessionSource !== 'campaign') return;
  if (!previousPhase.mapId || !previousPhase.triggerPos) return;

  GameState.setCampaignState(applyEncounterDefeatedToCampaign(
    GameState.getCampaignState(),
    previousPhase.mapId,
    previousPhase.triggerPos,
  ));
}

import type { GamePhase, PhaseAction } from './phases';
import type { PhaseTransitionMetadata } from './phaseTransitionMetadataContract';
import { GameState } from './GameState';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { wouldMapBeClearedAfterDefeatingMob } from '../world/mapCompletion';

/**
 * Shared "no derived facts apply" value.
 *
 * Frozen and shared for the same reason as NO_PHASE_EFFECTS: the vast majority of
 * transitions take this path, and no branch may drift into inventing its own shape.
 */
const NO_METADATA: PhaseTransitionMetadata = Object.freeze({ mapCleared: false });

/**
 * Derives the stateful facts `resolveTransition` needs but must never read itself.
 *
 * Read-only by construction: it looks up the map definition and campaign map state and
 * delegates the actual completion rule to `world/mapCompletion`. Every irrelevant or
 * incomplete case yields `{ mapCleared: false }` — never a throw, never a mutation.
 */
export function derivePhaseTransitionMetadata(
  currentPhase: GamePhase,
  action: PhaseAction,
): PhaseTransitionMetadata {
  if (action.type !== 'exit_battle' || action.outcome !== 'victory') return NO_METADATA;
  if (currentPhase.type !== 'battle') return NO_METADATA;
  // Debug battles have no world map; mapId/triggerPos are set only by campaign `enter_battle`.
  if (currentPhase.sessionSource !== 'campaign') return NO_METADATA;
  if (!currentPhase.mapId || !currentPhase.triggerPos) return NO_METADATA;

  const mapDef = MAP_DEFINITIONS[currentPhase.mapId];
  // mapId/triggerPos imply a campaign battle, which implies an existing campaign —
  // getCampaignState() is safe unguarded here.
  const mapState = GameState.getCampaignState().world.subMapStates[currentPhase.mapId];
  if (!mapDef || !mapState) return NO_METADATA;

  return {
    mapCleared: wouldMapBeClearedAfterDefeatingMob(mapDef, mapState, currentPhase.triggerPos),
  };
}

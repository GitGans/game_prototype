import type { CampaignState } from '../campaign';
import type { SubMapState, WorldPos } from '../world/types';
import { getRosterPartyStatus } from '../progression';

export interface WorldMapSnapshot {
  mapId: string;
  partyPos: WorldPos;
  mapState: SubMapState;
  selectedForBattleUnitCount: number;
  activeLivingUnitCount: number;
  canStartBattle: boolean;
}

/**
 * Projects `CampaignState.world` onto a `world_map` phase snapshot. Pure — takes the campaign
 * as a parameter rather than reading `GameState`, and lives outside `PhaseManager.ts` (which
 * imports the real `phaser` package, unusable in this project's Node-environment tests) so it
 * is unit-testable in isolation. Deep-clones `entityStates` and `partyPos`: both are mutable
 * objects, and the scene must never hold a live reference into campaign state.
 *
 * Party status is forwarded from `progression/rosterCamp.ts` so `resolveTransition` can reject
 * `enter_battle` for an invalid party without any scene or transition reading roster state.
 */
export function projectWorldMapSnapshot(campaign: CampaignState): WorldMapSnapshot {
  const source = campaign.world.subMapStates[campaign.world.currentMapId];
  if (!source) throw new Error(`Campaign world state is missing map "${campaign.world.currentMapId}"`);
  const entityStates = Object.fromEntries(
    Object.entries(source.entityStates).map(([key, state]) => [key, { ...state }]),
  );
  const { selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
    getRosterPartyStatus(campaign.roster);
  return {
    mapId: campaign.world.currentMapId,
    partyPos: { ...campaign.world.partyPos },
    mapState: { entityStates },
    selectedForBattleUnitCount,
    activeLivingUnitCount,
    canStartBattle,
  };
}

/**
 * Pure: returns a new CampaignState with `world.partyPos` replaced by a clone of `partyPos`.
 * Clones rather than storing the reference: `partyPos` is caller-owned (PhaseAction is a
 * public API boundary) — storing it directly would let campaign state alias an object the
 * caller could still mutate afterward (e.g. a reused scratch coordinate object).
 */
export function applyMovePartyToCampaign(campaign: CampaignState, partyPos: WorldPos): CampaignState {
  return { ...campaign, world: { ...campaign.world, partyPos: { ...partyPos } } };
}

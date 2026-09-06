import type { CampaignState } from '../campaign';
import type { SubMapState, WorldPos } from '../world/types';

/**
 * Pure campaign-world **write** transformations — the write-side counterpart to
 * `worldMapProjection.ts`, which is read-only and builds the committed `world_map` snapshot.
 *
 * Every function here is `(CampaignState, ...args) => CampaignState`: total, immutable, and
 * storage-free. Nothing in this module reads or writes `GameState`; installing the returned
 * campaign is the caller's job (`phaseHandlers/worldPhaseHandler.ts`).
 *
 * Keeping reads and writes in separate modules is deliberate. A single "world stuff" module
 * would be importable by the read pipeline for its mutations and by the write pipeline for its
 * projections, which is precisely the coupling the phase-pipeline decomposition removes.
 */

/**
 * Returns a new CampaignState with `world.partyPos` replaced by a CLONE of `partyPos`.
 *
 * Clones rather than storing the reference: `partyPos` arrives on a `PhaseAction`, a public API
 * boundary — storing it directly would let campaign state alias an object the caller can still
 * mutate afterward (e.g. a reused scratch coordinate object).
 */
export function applyMovePartyToCampaign(campaign: CampaignState, partyPos: WorldPos): CampaignState {
  return { ...campaign, world: { ...campaign.world, partyPos: { ...partyPos } } };
}

/**
 * Returns a new CampaignState with the encounter entity at `triggerPos` on map `mapId` marked
 * dead. This is the persistent consequence of winning a campaign battle: the defeated mob must
 * not reappear on the map.
 *
 * Immutable replacement at every level — entity state → `entityStates` → `SubMapState` →
 * `subMapStates` → `WorldState` → `CampaignState`. No campaign record is mutated in place.
 *
 * A missing sub-map state is a no-op returning the campaign BY IDENTITY, matching the
 * pre-extraction behavior of the coordinator's inline `if (src)` guard.
 *
 * The `${x},${y}` key format is not local convention: it is the shared entity key space that
 * `world/mapCompletion.ts` and `world/mapLogic.ts` read. Changing it here silently breaks
 * map-completion detection.
 */
export function applyEncounterDefeatedToCampaign(
  campaign: CampaignState,
  mapId: string,
  triggerPos: WorldPos,
): CampaignState {
  const source = campaign.world.subMapStates[mapId];
  if (!source) return campaign;

  const key = `${triggerPos.x},${triggerPos.y}`;
  const nextMap: SubMapState = {
    ...source,
    entityStates: { ...source.entityStates, [key]: { alive: false } },
  };
  return {
    ...campaign,
    world: {
      ...campaign.world,
      subMapStates: { ...campaign.world.subMapStates, [mapId]: nextMap },
    },
  };
}

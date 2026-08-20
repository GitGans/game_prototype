import type { PlayerPlacementCandidate } from '../battle/autoPlace';

/**
 * Short-lived, non-serializable, closure-carrying projection of one player
 * session into battle-ready placement candidates. Never persisted, never a
 * save source, and independent of the persistent raw records it was built from.
 */
export type PlayerBattleSetup = readonly PlayerPlacementCandidate[];

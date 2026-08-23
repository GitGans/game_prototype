import type { SubMapDefinition, SubMapState, WorldPos } from './types';

function allMobsDead(mapDefinition: SubMapDefinition, mapState: SubMapState): boolean {
  for (let row = 0; row < mapDefinition.layout.length; row++) {
    for (let col = 0; col < mapDefinition.layout[row].length; col++) {
      const cell = mapDefinition.layout[row][col];
      if (cell && typeof cell === 'object' && cell.type === 'mob') {
        const key = `${col},${row}`;
        if (mapState.entityStates[key]?.alive !== false) return false;
      }
    }
  }
  return true;
}

/**
 * True if defeating the mob at `triggerPos` would leave no live mobs on `mapDefinition`.
 * Pure — takes the map definition/state as explicit parameters instead of reading GameState,
 * mirroring worldMapProjection.ts's pattern, so PhaseManager can compute `{ mapCleared }`
 * metadata for the pure phaseTransitionResolver without either module reading runtime state.
 */
export function wouldMapBeClearedAfterDefeatingMob(
  mapDefinition: SubMapDefinition,
  mapState: SubMapState,
  triggerPos: WorldPos,
): boolean {
  const key = `${triggerPos.x},${triggerPos.y}`;
  const virtualEntityStates = { ...mapState.entityStates, [key]: { alive: false } };
  const virtualMapState: SubMapState = { ...mapState, entityStates: virtualEntityStates };
  return allMobsDead(mapDefinition, virtualMapState);
}

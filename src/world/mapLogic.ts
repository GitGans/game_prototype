import {
  SubMapDefinition,
  SubMapState,
  ResolvedCell,
  MapEntityEntries,
  IMPASSABLE_TERRAIN,
  ENTITY_TYPE_CONFIG,
} from './types';

export function initSubMapState(_map: SubMapDefinition): SubMapState {
  return { entityStates: {} };
}

export function canMove(map: SubMapDefinition, x: number, y: number): boolean {
  if (y < 0 || y >= map.layout.length) return false;
  if (x < 0 || x >= map.layout[y].length) return false;
  const cell = map.layout[y][x];
  if (typeof cell === 'string' && IMPASSABLE_TERRAIN.has(cell)) return false;
  return true;
}

export function resolveCell(
  map: SubMapDefinition,
  state: SubMapState,
  x: number,
  y: number,
): ResolvedCell {
  const cell = map.layout[y]?.[x];

  if (cell === null || cell === undefined) return { passable: true, entity: null };
  if (typeof cell === 'string') return { passable: false, entity: null };

  const key = `${x},${y}`;
  const entityState = state.entityStates[key];
  const alive = !entityState || entityState.alive !== false;

  if (!alive) {
    return { passable: true, entity: null };
  }

  // Cast to satisfy TypeScript strict index access — cell.type is always a valid key
  const entries = map.entities[cell.type as keyof MapEntityEntries] as
    | Record<string, unknown>
    | undefined;
  const data = entries?.[cell.id] ?? {};
  const typeConfig = ENTITY_TYPE_CONFIG[cell.type];

  return {
    passable: cell.type !== 'mob',
    entity: {
      type: cell.type,
      triggersOnEnter: typeConfig.triggersOnEnter,
      data: data as never,
    },
  };
}

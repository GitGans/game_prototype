export type {
  MapEntityType, LayoutCell,
  MobEntry, CampEntry, PortalEntry, ShopEntry,
  MapEntityEntries, SubMapDefinition, SubMapState, WorldPos,
} from '../shared/worldTypes';

import type { MapEntityType, SubMapState, WorldPos } from '../shared/worldTypes';

/**
 * `CampaignState.world` is authoritative for the current map, party position, and per-map
 * persistent state. `GamePhase.world_map` contains only a render snapshot of these values,
 * rebuilt from this on every transition — it never holds authoritative state itself.
 */
export interface WorldState {
  currentMapId: string;
  partyPos: WorldPos;
  subMapStates: Record<string, SubMapState>;
}

export const ENTITY_TYPE_CONFIG: Record<MapEntityType, { triggersOnEnter: boolean }> = {
  mob:    { triggersOnEnter: true  },
  camp:   { triggersOnEnter: false },
  portal: { triggersOnEnter: true  },
  shop:   { triggersOnEnter: false },
};

export const IMPASSABLE_TERRAIN = new Set<string>(['wall', 'tree']);

import type { MobEntry, CampEntry, PortalEntry, ShopEntry } from '../shared/worldTypes';

export interface ResolvedCell {
  passable: boolean;
  entity: {
    type: MapEntityType;
    triggersOnEnter: boolean;
    data: MobEntry | CampEntry | PortalEntry | ShopEntry;
  } | null;
}

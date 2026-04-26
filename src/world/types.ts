export type {
  MapEntityType, LayoutCell,
  MobEntry, CampEntry, PortalEntry, ShopEntry,
  MapEntityEntries, SubMapDefinition, SubMapState,
} from '../shared/worldTypes';

import type { MapEntityType } from '../shared/worldTypes';

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

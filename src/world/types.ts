export type MapEntityType = 'mob' | 'camp' | 'portal' | 'shop';

export type LayoutCell =
  | null
  | 'wall' | 'tree'
  | { type: MapEntityType; id: string };

export const ENTITY_TYPE_CONFIG: Record<MapEntityType, { triggersOnEnter: boolean }> = {
  mob:    { triggersOnEnter: true  },
  camp:   { triggersOnEnter: false },
  portal: { triggersOnEnter: true  },
  shop:   { triggersOnEnter: false },
};

export const IMPASSABLE_TERRAIN = new Set<string>(['wall', 'tree']);

export type MobEntry    = { enemyGroupId: string };
export type CampEntry   = Record<string, never>;
export type PortalEntry = { targetMapId: string; targetX: number; targetY: number };
export type ShopEntry   = { shopId: string };

export interface MapEntityEntries {
  mob?:    Record<string, MobEntry>;
  camp?:   Record<string, CampEntry>;
  portal?: Record<string, PortalEntry>;
  shop?:   Record<string, ShopEntry>;
}

export interface SubMapDefinition {
  id: string;
  startPos: { x: number; y: number };
  layout: LayoutCell[][];
  entities: MapEntityEntries;
}

export interface SubMapState {
  entityStates: Record<string, { alive: boolean }>;
}

export interface ResolvedCell {
  passable: boolean;
  entity: {
    type: MapEntityType;
    triggersOnEnter: boolean;
    data: MobEntry | CampEntry | PortalEntry | ShopEntry;
  } | null;
}

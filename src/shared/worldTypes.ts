export type MapEntityType = 'mob' | 'camp' | 'portal' | 'shop';

/** World-map grid position (distinct from battle-grid `CellCoord` in `gridTypes.ts`). */
export interface WorldPos {
  x: number;
  y: number;
}

export type LayoutCell =
  | null
  | 'wall' | 'tree'
  | { type: MapEntityType; id: string };

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
  startPos: WorldPos;
  layout: LayoutCell[][];
  entities: MapEntityEntries;
}

export interface SubMapState {
  entityStates: Record<string, { alive: boolean }>;
}

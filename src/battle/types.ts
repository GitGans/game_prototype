export type Side = 'player' | 'enemy';
export type Row = 0 | 1; // 0 = front, 1 = back
export type Col = 0 | 1 | 2;

export type RowTrait = 'front' | 'back';
export type UnitRace = 'orc' | 'demon' | 'undead';

export interface CellCoord {
  side: Side;
  row: Row;
  col: Col;
}

export interface ShapeOffset {
  dr: number;
  dc: number;
}

export interface UnitShape {
  offsets: ShapeOffset[];
}

export interface UnitBlueprint {
  templateId: string;
  name: string;
  hp: number;
  initiative: number;
  shape: UnitShape;
  actionType: 'attack' | 'heal';
  rowTrait: RowTrait;
  race?: UnitRace;
}

export interface Unit {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  initiative: number;
  shape: UnitShape;
  anchor: CellCoord;
  actionType: 'attack' | 'heal';
  rowTrait: RowTrait;
  race?: UnitRace;
  templateId: string;
}

export interface OccupancyMap {
  cellToUnit: Map<string, Unit>;
  unitToCells: Map<string, CellCoord[]>;
}

export type Phase = 'placement' | 'select_target' | 'end';

export interface BattleState {
  units: Map<string, Unit>;
  occupancy: OccupancyMap;
  roundQueue: string[]; // unit IDs to act this round; [0] = currently acting
  phase: Phase;
  validTargets: CellCoord[];
  benchUnits: UnitBlueprint[]; // player units waiting on the bench
}

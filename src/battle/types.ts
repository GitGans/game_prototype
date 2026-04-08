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

export type SpriteState = 'idle' | 'attack' | 'death';

export interface SpriteSheetConfig {
  path: string;          // path from public/, e.g. 'assets/sprites/units/dd_medium.png'
  frameWidth: number;    // width of one frame in pixels
  frameHeight: number;   // height of one frame in pixels
  states: SpriteState[]; // states in column order, e.g. ['idle', 'attack', 'death']
}

export interface UnitBlueprint {
  templateId: string;
  name: string;
  hp: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;  // percentage 0–100, reduces incoming physical damage
  magicalDefense: number;   // percentage 0–100, reduces incoming magical damage
  healAmount: number;
  level: number;
  initiative: number;
  shape: UnitShape;
  actionType: 'melee' | 'ranged' | 'heal';
  skill?: Skill;
  rowTrait: RowTrait;
  race?: UnitRace;
  spriteSheet?: SpriteSheetConfig;
}

export interface Unit {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
  healAmount: number;
  level: number;
  initiative: number;
  shape: UnitShape;
  anchor: CellCoord;
  actionType: 'melee' | 'ranged' | 'heal';
  skill?: Skill;
  rowTrait: RowTrait;
  race?: UnitRace;
  templateId: string;
}

export interface OccupancyMap {
  cellToUnit: Map<string, Unit>;
  unitToCells: Map<string, CellCoord[]>;
}

export type Phase = 'placement' | 'select_target' | 'end';
export type BattleMode = 'manual' | 'auto' | 'quick';

export interface BattleState {
  units: Map<string, Unit>;
  occupancy: OccupancyMap;
  roundQueue: string[]; // unit IDs to act this round; [0] = currently acting
  phase: Phase;
  validTargets: CellCoord[];
  benchUnits: (UnitBlueprint | undefined)[]; // player units waiting on the bench; undefined = empty slot
}

// ─── Skill / Pattern System ───────────────────────────────────────────────

export type DamageType = 'physical' | 'magical';
export type SkillEffectType = 'damage' | 'heal';

/**
 * One active cell in a skill pattern.
 * Stored as an object so fields (e.g. status effects) can be added later
 * without changing the matrix structure.
 */
export interface PatternCell {
  damageMultiplier: number;
  // future: effects?: StatusEffect[]
}

/**
 * 2D matrix defining a skill's area of effect.
 *
 * cells[rowIndex][colIndex]:
 *   PatternCell → this cell is part of the pattern
 *   null        → this cell is not affected
 *
 * anchorRow / anchorCol: the matrix position that maps to the player-selected
 * target cell. All other cells are offset relative to this anchor.
 *
 * The `side` dimension is not part of the pattern — it is always inherited
 * from the selected target cell (attacks never cross sides).
 */
export interface SkillPattern {
  anchorRow: number;
  anchorCol: number;
  cells: (PatternCell | null)[][];
}

export interface Skill {
  id: string;
  name: string;
  damageType: DamageType;
  effectType: SkillEffectType;
  pattern: SkillPattern;
}

/**
 * One cell produced by resolvePattern().
 * Ready to pass directly to resolveAttack() or resolveHeal().
 */
export interface ResolvedHitCell {
  coord: CellCoord;
  multiplier: number;
}

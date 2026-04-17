export type Side = 'player' | 'enemy';
export type Row = 0 | 1; // 0 = front, 1 = back
export type Col = 0 | 1 | 2;

export type RowTrait = 'front' | 'back';
export type UnitRace = 'orc' | 'demon' | 'undead';
export type UnitClass = 'warrior' | 'ranger' | 'mage' | 'priest';

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
  dodge: number;            // % chance to avoid damage entirely (effective cap: 90)
  block: number;            // % chance to take only 50% damage (effective cap: 90)
  level: number;
  initiative: number;
  shape: UnitShape;
  skills: Skill[];
  rowTrait: RowTrait;
  race?: UnitRace;
  unitClass: UnitClass;
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
  dodge: number;
  block: number;
  level: number;
  initiative: number;
  shape: UnitShape;
  anchor: CellCoord;
  skills: Skill[];
  activeSkillIndex: number;
  rowTrait: RowTrait;
  race?: UnitRace;
  templateId: string;
  activeEffects: ActiveEffect[]; // runtime only; max 2; ordered oldest-first
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
export type SkillActionType = 'melee' | 'ranged' | 'mass_enchantment' | 'self_enchantment';

// ─── Effect System ────────────────────────────────────────────────────────────

/** Reusable mechanical effect definition (referenced by SkillEffectBlock). */
export interface Effect {
  id: string;
  isBuff: boolean;               // true = green square, false = red square
  physicalDefenseBonus?: number; // flat additive modifier to physicalDefense while active
  magicalDefenseBonus?: number;  // flat additive modifier to magicalDefense while active
  dodgeBonus?: number;           // flat % added to unit.dodge before 90% cap
  blockBonus?: number;           // flat % added to unit.block before 90% cap
  initiativeBonus?: number;      // flat added to unit.initiative for queue ordering
  physicalDamageBonus?: number;  // flat additive modifier to physicalDamage while active
  magicalDamageBonus?: number;   // flat additive modifier to magicalDamage while active
  description?: string;          // short tooltip description shown on hover
}

/** Live buff/debuff instance on a unit. */
export interface ActiveEffect {
  effectDisplayName: string; // display name shown in log/UI (e.g. "Poisoned")  (was: effectName)
  effect: Effect;
  remainingRounds: number;   // decremented at round end; removed when reaches 0
  computedPerTurn?: number;  // heal (isBuff) or damage per tick; undefined for defense-only effects
}

/** Skill block that deals damage. */
export interface DamageBlock {
  matrixName: string;   // key into DAMAGE_MATRICES (src/data/skillDefinitions.ts)
  damageType: DamageType;
  level: number;        // which level of DAMAGE_MATRICES to use (1-based)
}

/** Skill block that applies a buff/debuff. Never deals damage. */
export interface SkillEffectBlock {
  effectMatrixName: string;   // key into EFFECT_MATRICES (src/data/skillDefinitions.ts)
  level: number;              // which level of EFFECT_MATRICES to use (1-based)
  effectDisplayName: string;  // display name for the applied status (e.g. "Poisoned")   (was: effectName)
  effectName: string;         // key into LEVELED_EFFECTS                                (was: leveledEffectName)
  duration: number;           // number of rounds the effect lasts
  damageType: DamageType;     // kept for display / targeting context
}

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

/** Damage matrix with per-level patterns. levels[0] = level 1, levels[1] = level 2, etc. */
export interface LeveledDamageMatrix {
  levels: SkillPattern[];
}

/**
 * Effect definition. Two mutually exclusive modes:
 * - effectDamageType present → per-turn value = casterStat × effect matrix multiplier (regeneration / lose_health)
 * - bonusByLevel present     → fixed defense bonus per level; sign comes from base Effect (fortify / weaken / etc.)
 */
export interface LeveledEffectDef {
  effect: Effect;
  effectDamageType?: DamageType; // which caster stat drives computedPerTurn; present iff stat-based
  bonusByLevel?: number[];       // fixed defense bonus magnitude per level (e.g. [10, 20, 30]); present iff defense-only
}

// ─── Instant Effect System ────────────────────────────────────────────────────

export type InstantEffectType = 'provoke' | 'distract';

/**
 * Skill block that fires instantly on the target.
 * Unlike SkillEffectBlock, this leaves no ActiveEffect on the unit.
 * The cell values in INSTANT_EFFECT_MATRICES are success probabilities (0–1).
 * Dodge / block / defense do NOT apply to the probability roll.
 */
export interface InstantEffectBlock {
  instantEffectMatrixName: string; // key into INSTANT_EFFECT_MATRICES
  level: number;                   // 1-based index into matrix levels
  instantEffectType: InstantEffectType;
  displayName: string;             // shown in battleLog, e.g. "Provoke"
}

export type InstantEffectEvent =
  | { type: 'instant_effect_applied'; unitId: string; unitName: string; displayName: string }
  | { type: 'instant_effect_failed';  unitId: string; unitName: string; displayName: string }
  | { type: 'provoke_skip';           unitId: string; unitName: string }
  | { type: 'distract_skip';          unitId: string; unitName: string };

export interface Skill {
  id: string;
  name: string;
  actionType: SkillActionType;
  // level lives in damageBlock and/or effectBlock, not here
  damageBlock?: DamageBlock;
  effectBlock?: SkillEffectBlock;
  instantEffectBlock?: InstantEffectBlock;
}

/**
 * One cell produced by resolvePattern().
 * Ready to pass directly to resolveAttack() or resolveHeal().
 */
export interface ResolvedHitCell {
  coord: CellCoord;
  multiplier: number;
}

// ─── Item System ──────────────────────────────────────────────────────────────

export type EquipSlot =
  | 'ring_1'
  | 'ring_2'
  | 'ring'        // item-level type only — never a container slot key
  | 'helmet'
  | 'necklace'
  | 'hand_right'
  | 'armor'
  | 'hand_left'
  | 'gloves'
  | 'belt'
  | 'boots'
  | 'artifact';

export interface ItemStatBonuses {
  hp?: number;
  physicalDamage?: number;
  magicalDamage?: number;
  physicalDefense?: number;
  magicalDefense?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  equipSlot: EquipSlot | null;  // null = can only live in backpack (e.g. future consumables)
  subclass?: string;             // e.g. 'robe' | 'medium_armor' | 'heavy_armor' — plain string, extend freely in data
  allowedClasses?: UnitClass[];  // absent or [] = usable by all classes
  statBonuses: ItemStatBonuses;
  sprite?: string;  // path from public/, e.g. 'assets/sprites/items/wooden_ring.png'
}

export interface ItemInstance {
  id: string;           // unique runtime id, e.g. 'item_001'
  definitionId: string; // references ItemDefinition.id
}

export type ContainerKind = 'backpack' | 'equipment';

export interface ItemContainer {
  id: string;               // e.g. 'backpack_tank', 'equip_tank'
  kind: ContainerKind;
  ownerTemplateId?: string;  // unit templateId; absent for shared containers (e.g. backpack_shared)
  slots: Record<string, string>;
  // Convention:
  //   backpack  → keys are '0'–'23' (sparse; absent key = empty cell)
  //   equipment → keys are EquipSlot strings, e.g. 'accessory' (absent = empty)
  // NEVER store null/undefined as a value — only set and delete keys.
}

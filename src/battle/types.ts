// ─── Migration re-exports — TODO Step 3: remove all of these; migrate each caller to direct shared/ import ───
export type { Side, Row, Col, CellCoord, ShapeOffset, UnitShape } from '../shared/gridTypes';
export type {
  DamageType, SkillActionType,
  Effect, DamageBlock, SkillEffectBlock,
  PatternCell, SkillPattern, LeveledDamageMatrix, LeveledEffectDef,
  InstantEffectType, InstantEffectBlock, InstantEffectEvent,
  DamageModifierType, DamageModifierBlock,
  PostDamageType, PostDamageBlock, Skill,
} from '../shared/skillTypes';
export type {
  SpriteState, SpriteSheetConfig, RowTrait, UnitRace, UnitClass,
  UnitProgressionStatModifiers, UnitBattleStats,
  UnitUpgradeOption, UnitUpgradeTier, SkillTier, EnemyLevelSkill, UnitBlueprint,
} from '../shared/unitTypes';
export type {
  EquipSlot, BattleStatBonuses, MapStatBonuses,
  ItemUsage, ItemUseEffectType, ItemUseEffect, ItemDefinition,
  UnitActivatableAbility, ItemInstance, ContainerKind, ItemContainer,
} from '../shared/itemTypes';
export type {
  UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot,
  ItemSlotSnapshot, BackpackSnapshot, EquipmentSnapshot, UnitTabSnapshot,
} from '../shared/snapshotTypes';

// ─── Runtime battle contracts (only types that exist during an active battle) ──

import type { CellCoord, UnitShape } from '../shared/gridTypes';
import type { Skill, Effect } from '../shared/skillTypes';
import type { SpriteSheetConfig, RowTrait, UnitRace } from '../shared/unitTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';

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
  spriteSheet?: SpriteSheetConfig;  // resolved at unit creation; undefined = no sprite
  activeEffects: ActiveEffect[]; // runtime only; max 2; ordered oldest-first
  activatableAbilities: UnitActivatableAbility[]; // [] for enemies
}

export interface ActiveEffect {
  effectDisplayName: string; // display name shown in log/UI (e.g. "Poisoned")
  effect: Effect;
  remainingRounds: number;   // decremented at round end; removed when reaches 0
  computedPerTurn?: number;  // heal (isBuff) or damage per tick; undefined for defense-only effects
}

export interface OccupancyMap {
  cellToUnit: Map<string, Unit>;
  unitToCells: Map<string, CellCoord[]>;
}

export type Phase = 'placement' | 'select_target' | 'end';
export type BattleMode = 'manual' | 'auto' | 'quick';

export interface BenchUnitRef {
  templateId: string;
}

export interface PlacementSelection {
  selectedBenchIdx:    number | null;
  selectedFieldUnitId: string | null;
}

export interface BattleState {
  units:              Map<string, Unit>;
  occupancy:          OccupancyMap;
  roundQueue:         string[]; // unit IDs to act this round; [0] = currently acting
  phase:              Phase;
  validTargets:       CellCoord[];
  benchUnits:         (BenchUnitRef | undefined)[]; // player units waiting on the bench; undefined = empty slot
  nextPlayerId:       number;          // next p<n> id for unit creation during placement
  placementSelection: PlacementSelection; // UI selection; owned by BattleState so Game.ts stays stateless
}

export interface ResolvedHitCell {
  coord: CellCoord;
  multiplier: number;
}

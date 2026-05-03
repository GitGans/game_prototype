// ─── Re-exports — TODO(post-refactor): migrate each caller to direct shared/ import and remove these. ───
export type { Side, Row, Col, CellCoord, ShapeOffset, UnitShape } from '../shared/gridTypes';
export type {
  DamageType,
  Effect, SkillEffectBlock,
  PatternCell, SkillPattern, LeveledDamageMatrix, LeveledEffectDef,
  InstantEffectType, InstantEffectBlock, InstantEffectEvent,
  DamageModifierType, DamageModifierBlock,
  PostDamageType, PostDamageBlock,
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
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { SpriteSheetConfig, RowTrait, UnitRace } from '../shared/unitTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';

export type { ActiveEffect } from '../shared/activeEffect';
import type { ActiveEffect } from '../shared/activeEffect';

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
  skills: ActionSkillDefinition[];
  activeSkillIndex: number;
  rowTrait: RowTrait;
  race?: UnitRace;
  templateId: string;
  spriteSheet?: SpriteSheetConfig;  // resolved at unit creation; undefined = no sprite
  activeEffects: ActiveEffect[]; // runtime only; max 2; ordered oldest-first
  activatableAbilities: UnitActivatableAbility[]; // [] for enemies
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

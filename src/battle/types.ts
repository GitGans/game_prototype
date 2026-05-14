export type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';

// ─── Re-exports — TODO(post-refactor): migrate each caller to direct shared/ import and remove these. ───
export type { Side, Row, Col, CellCoord, ShapeOffset, UnitShape } from '../shared/gridTypes';
export type {
  Effect,
  PatternCell, SkillPattern,
  ProbabilityEffectType, ProbabilityEffectEvent,
  DamageModifierType,
  PostDamageType,
} from '../shared/skillTypes';
export type {
  SpriteState, SpriteSheetConfig, RowTrait, UnitRace,
  UnitClassId, UnitClassDefinition,
  UnitProgressionStatModifiers, UnitBattleStats,
  UnitUpgradeOption, UnitUpgradeTier, EnemySkillUnlock, UnitBlueprint, UpgradeOptionId,
} from '../shared/unitTypes';
export { ucid } from '../shared/unitTypes';
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
import type { SpriteSheetConfig, RowTrait, UnitClassId } from '../shared/unitTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';

export type { ActiveEffect } from '../shared/activeEffect';
import type { ActiveEffect } from '../shared/activeEffect';

export interface Unit {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  level: number;
  classId: UnitClassId;
  initiative: number;
  shape: UnitShape;
  anchor: CellCoord;
  skills: ActionSkillDefinition[];
  activeSkillIndex: number;
  rowTrait: RowTrait;
  templateId: string;
  spriteSheet?: SpriteSheetConfig;  // resolved at unit creation; undefined = no sprite
  activeEffects: ActiveEffect[]; // runtime only; max 2; ordered oldest-first
  activatableAbilities: UnitActivatableAbility[]; // [] for enemies
}

export interface OccupancyMap {
  cellToUnitId: Map<string, string>; // cellKey → unit id
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
  // Stage 1 migration bridge: source of truth for bench UI/placement until bench units
  // become real Unit objects with UnitDeployment bench entries in a later stage.
  benchUnits:         (BenchUnitRef | undefined)[];
  nextPlayerId:       number;          // next p<n> id for unit creation during placement
  placementSelection: PlacementSelection; // UI selection; owned by BattleState so Game.ts stays stateless
  // Stage 1 invariant: every unit in state.units has exactly one entry here,
  // and every entry here references an existing unit in state.units.
  // Bench contents in benchUnits are NOT mirrored here in Stage 1.
  deployments:        Map<string, UnitDeployment>;
  // Total bench capacity. Set from battle setup; drives getFreeBenchSlot().
  benchSlotCount:     number;
}

export interface ResolvedHitCell {
  coord: CellCoord;
  multiplier: number;
}

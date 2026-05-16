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

import type { Side, UnitShape, CellCoord } from '../shared/gridTypes';
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
  // Faction/owner. Field position lives in UnitDeployment.anchor (not on Unit).
  side: Side;
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

export interface PlacementSelection {
  // Identity of the selected bench unit. UI operates on bench slots, but
  // runtime selection is stored by unit id, resolved through state.deployments.
  selectedBenchUnitId: string | null;
  selectedFieldUnitId: string | null;
}

export interface BattleState {
  // Runtime invariant:
  //   state.units = ALL battle participants (field + bench).
  //   Field combatants  = units with deployments.get(id)?.kind === 'field'.
  //   Bench participants = units with deployments.get(id)?.kind === 'bench'.
  units:              Map<string, Unit>;
  occupancy:          OccupancyMap;
  roundQueue:         string[]; // unit IDs to act this round; [0] = currently acting; field units only
  phase:              Phase;
  validTargets:       CellCoord[];
  nextPlayerId:       number;          // next p<n> id for unit creation during placement
  placementSelection: PlacementSelection; // UI selection; owned by BattleState so Game.ts stays stateless
  // Source of truth for all placement. Every unit in state.units has exactly one entry here.
  deployments:        Map<string, UnitDeployment>;
  // Total bench capacity. Set from battle setup; drives getFreeBenchSlot().
  benchSlotCount:     number;
}

export interface ResolvedHitCell {
  coord: CellCoord;
  multiplier: number;
}

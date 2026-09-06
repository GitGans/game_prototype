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
  UnitLifeState,
} from '../shared/unitTypes';
export { ucid } from '../shared/unitTypes';
export type {
  EquipSlot, BattleStatBonuses, PartialBattleStatBonuses,
  ItemUseEffect, ItemDefinition,
  ItemRuntimeKind, ItemRuntimeMetadata, ItemCatalog,
  ItemInstance, ContainerKind, ItemContainer,
} from '../shared/itemTypes';
export type {
  UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot,
  ItemSlotSnapshot, BackpackSnapshot, EquipmentSnapshot, UnitTabSnapshot,
} from '../shared/snapshotTypes';

// ─── Runtime battle contracts (only types that exist during an active battle) ──

import type { Side, UnitShape, CellCoord } from '../shared/gridTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { SpriteSheetConfig, RowTrait, UnitClassId, UnitLifeState, UnitBattleStats } from '../shared/unitTypes';

export type { ActiveEffect } from '../shared/activeEffect';
import type { ActiveEffect } from '../shared/activeEffect';

// Runtime-owned and read-only: every state transition builds a replacement unit
// (`{ ...unit, hp: nextHp }`) rather than patching in place. Readonly makes that the
// only compiling option for anything holding a unit from the battle-runtime read gateway.
export interface Unit {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  // Runtime life/death. Invariant: 'alive' ⇒ hp > 0; 'dead' ⇒ hp === 0.
  // Use isAlive()/killUnit()/reviveUnit() from ./lifeState — do not flip directly.
  readonly lifeState: UnitLifeState;
  readonly physicalStrength: number;
  readonly magicalStrength: number;
  readonly physicalDefense: number;
  readonly magicalDefense: number;
  readonly dodge: number;
  readonly block: number;
  readonly level: number;
  readonly classId: UnitClassId;
  readonly initiative: number;
  readonly shape: UnitShape;
  // Faction/owner. Field position lives in UnitDeployment.anchor (not on Unit).
  readonly side: Side;
  // The array is runtime-owned and readonly. Its entries are shared immutable static
  // content from the SKILLS registry — deliberately not converted; see the read-gateway
  // bullet in the root CLAUDE.md for the documented exception.
  readonly skills: readonly ActionSkillDefinition[];
  readonly activeSkillIndex: number;
  readonly rowTrait: RowTrait;
  readonly templateId: string;
  readonly spriteSheet?: SpriteSheetConfig;  // resolved at unit creation; undefined = no sprite
  readonly activeEffects: readonly ActiveEffect[]; // runtime only; max 2; ordered oldest-first

  // UI/read-model support captured at battle creation. Equipment is fixed for the
  // whole battle, so this baseline is immutable. USED ONLY for stat color highlighting
  // in snapshots. Combat formulas, HP clamping, revive, persistence, and damage/heal
  // logic must NEVER read this — they use the flat runtime stat fields above.
  readonly statHighlightBaseStats: Readonly<UnitBattleStats>;
}

export interface OccupancyMap {
  readonly cellToUnitId: ReadonlyMap<string, string>; // cellKey → unit id
  readonly unitToCells: ReadonlyMap<string, readonly CellCoord[]>;
}

export type Phase = 'placement' | 'select_target' | 'end';
export type BattleMode = 'manual' | 'auto' | 'quick';

export interface PlacementSelection {
  // Identity of the selected bench unit. UI operates on bench slots, but
  // runtime selection is stored by unit id, resolved through state.deployments.
  readonly selectedBenchUnitId: string | null;
  readonly selectedFieldUnitId: string | null;
}

// Every state-mutating battle function returns a NEW BattleState; nothing is mutated
// in place. The readonly collections make that contract enforceable rather than
// conventional — a caller holding state from the read gateway must build a replacement.
export interface BattleState {
  // Runtime invariant:
  //   state.units = ALL battle participants (field + bench).
  //   Field combatants  = units with deployments.get(id)?.kind === 'field'.
  //   Bench participants = units with deployments.get(id)?.kind === 'bench'.
  readonly units:              ReadonlyMap<string, Unit>;
  readonly occupancy:          OccupancyMap;
  readonly roundQueue:         readonly string[]; // unit IDs to act this round; [0] = currently acting; field units only
  readonly phase:              Phase;
  readonly validTargets:       readonly CellCoord[];
  readonly nextPlayerId:       number;          // next p<n> id for unit creation during placement
  readonly placementSelection: PlacementSelection; // UI selection; owned by BattleState so Game.ts stays stateless
  // Manual-targeting preview selection (transient UI). Single source of truth for the
  // battlefield + initiative-bar target highlight. Never serialized (BattleState is not saved).
  readonly previewTargetCoord: CellCoord | null;
  // Source of truth for all placement. Every unit in state.units has exactly one entry here.
  readonly deployments:        ReadonlyMap<string, UnitDeployment>;
  // Total bench capacity. Set from battle setup; drives getFreeBenchSlot().
  readonly benchSlotCount:     number;
}

export interface ResolvedHitCell {
  readonly coord: CellCoord;
  readonly multiplier: number;
}

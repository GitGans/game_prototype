import type { CellCoord, UnitShape, Side }          from './gridTypes';
import type { ActionSkillDefinition }                from './skillDefinitionTypes';
import type { SpriteSheetConfig, RowTrait } from './unitTypes';
import type { UnitActivatableAbility }               from './itemTypes';
import type { UnitStatsSnapshot, SkillIconSnapshot } from './snapshotTypes';
import type { ActiveEffect }                         from './activeEffect';
import type { UnitDeployment }                       from './unitDeploymentTypes';

// ─── Bench unit snapshot (display data for one bench slot) ───────────────────

export interface BenchUnitSnapshot {
  templateId: string;
  name:       string;
  level:      number;
  spriteKey:  string | null;
  stats:      UnitStatsSnapshot;
  skills:     SkillIconSnapshot[];
}

// ─── Scene-facing unit snapshot ───────────────────────────────────────────────

export interface BattleUnitSnapshot {
  id:       string;
  side:     Side;
  name:     string;
  hp:       number;
  maxHp:    number;

  physicalStrength:    number;
  magicalStrength:     number;
  physicalDefense:     number;
  magicalDefense:      number;
  dodge:               number;
  block:               number;
  level:               number;
  initiative:          number;
  effectiveInitiative:       number; // pre-computed via effectiveStats; used by InitiativeBar
  effectivePhysicalStrength: number;
  effectiveMagicalStrength:  number;
  effectivePhysicalDefense: number;
  effectiveMagicalDefense:  number;
  effectiveDodge:           number;
  effectiveBlock:           number;

  shape:  UnitShape;

  // Compatibility mirror of deployment.anchor for existing field-only UI.
  // Present iff deployment.kind === 'field'. Removed in Stage 5; consumers
  // should use FieldBattleUnitSnapshot or deployment.anchor instead.
  anchor?: CellCoord;

  // Always a fresh copy. Never share the runtime UnitDeployment reference.
  deployment: UnitDeployment;

  // Render-ready texture key derived by core. UI components must read this
  // field instead of deriving keys themselves.
  spriteKey: string | null;

  skills:           readonly ActionSkillDefinition[];
  activeSkillIndex: number;
  activeEffects:    readonly ActiveEffect[];

  rowTrait:   RowTrait;
  templateId: string;
  spriteSheet?: SpriteSheetConfig;

  activatableAbilities: readonly UnitActivatableAbility[];
}

export type FieldBattleUnitSnapshot =
  BattleUnitSnapshot & {
    deployment: Extract<UnitDeployment, { kind: 'field' }>;
    anchor:     CellCoord;
  };

// ─── Occupancy snapshot ───────────────────────────────────────────────────────

export interface BattleOccupancySnapshot {
  cellToUnitId: Map<string, string>;       // cellKey → unit id
  unitToCells:  Map<string, CellCoord[]>;  // unit id → occupied cells (copied)
}

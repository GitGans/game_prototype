import type { CellCoord, UnitShape, Side }          from './gridTypes';
import type { ActionSkillDefinition }                from './skillDefinitionTypes';
import type { SpriteSheetConfig, RowTrait, UnitLifeState } from './unitTypes';
import type { UnitActivatableAbility }               from './itemTypes';
import type { ActiveEffect }                         from './activeEffect';
import type { UnitDeployment }                       from './unitDeploymentTypes';

// ─── Scene-facing unit snapshot ───────────────────────────────────────────────

// Invariant from battle runtime: lifeState === 'alive' ⇒ hp > 0
//                                lifeState === 'dead'  ⇒ hp === 0
// UI must branch on lifeState, never on hp.
export interface BattleUnitSnapshot {
  id:        string;
  side:      Side;
  name:      string;
  hp:        number;
  maxHp:     number;
  lifeState: UnitLifeState;

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
  };

// ─── Occupancy snapshot ───────────────────────────────────────────────────────

export interface BattleOccupancySnapshot {
  cellToUnitId: Map<string, string>;       // cellKey → unit id
  unitToCells:  Map<string, CellCoord[]>;  // unit id → occupied cells (copied)
}

// All field-deployed units (alive and dead, both sides). Render-only.
// Distinct from BattleOccupancySnapshot, which is living/blocking-only.
//
// cellToUnitIds is an array because dead bodies are non-blocking and
// future resurrection / movement may temporarily overlap on a cell.
// Ordering is deterministic: living first, then dead, preserving
// state.units insertion order within each group. UI may pick the first.
export interface BattleFieldUnitCellsSnapshot {
  cellToUnitIds: Map<string, string[]>;       // cellKey → [unitId, ...]
  unitToCells:   Map<string, CellCoord[]>;    // unitId  → occupied cells (copied)
}

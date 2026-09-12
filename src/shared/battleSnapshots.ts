import type { CellCoord, UnitShape, Side }          from './gridTypes';
import type { ActionSkillDefinition }                from './skillDefinitionTypes';
import type { SpriteState, RowTrait, UnitLifeState } from './unitTypes';
import type { ActiveEffect }                         from './activeEffect';
import type { UnitDeployment }                       from './unitDeploymentTypes';
import type { UnitStatsSnapshot }                    from './snapshotTypes';
import type { BattleItemUseFailure, ReadonlyItemUseEffect } from './itemTypes';

// Minimal render-ready sprite data for a battle unit. Built by
// core/battleSnapshotBuilder — UI must not derive texture keys itself.
//   textureKey — resolved Phaser texture key.
//   states     — sprite-state order; index === spritesheet frame index
//                (frame 0 is idle by authoring convention).
export interface UnitSpriteSnapshot {
  textureKey: string;
  states: readonly SpriteState[];
}

// ─── Skill-bar actions ────────────────────────────────────────────────────────

/**
 * One render-ready entry of the active unit's action bar: an ordinary skill, or the item
 * equipped in its `usable_slot`.
 *
 * A discriminated reference, not a synthetic skill: the item is never registered in the static
 * skill catalog, never added to learned skills and never shifts ordinary skill indexes — which
 * is also what keeps it out of AI skill selection.
 *
 * `disabledReason` is structured; the wording lives in
 * `objects/itemUseEffectPresentation.ts`, which `core/` must not import.
 */
export type BattleActionBarEntry =
  | {
      readonly kind: 'skill';
      readonly skillIndex: number;
      readonly skill: ActionSkillDefinition;
    }
  | {
      readonly kind: 'item';
      readonly unitId: string;
      readonly instanceId: string;
      readonly label: string;
      readonly sprite: string | null;
      /** Copied, never shared with the runtime resource or the catalog. */
      readonly effect: ReadonlyItemUseEffect;
      readonly enabled: boolean;
      readonly disabledReason: BattleItemUseFailure | null;
    };

// ─── Scene-facing unit snapshot ───────────────────────────────────────────────

// Invariant from battle runtime: lifeState === 'alive' ⇒ hp > 0
//                                lifeState === 'dead'  ⇒ hp === 0
// UI must branch on lifeState, never on hp.
export interface BattleUnitSnapshot {
  id:        string;
  side:      Side;
  name:      string;
  className: string;   // resolved class display name; built in core/battleSnapshotBuilder
  currentHp: number;
  maxHp:     number;
  lifeState: UnitLifeState;

  // currentHp/maxHp = live battle HP (HP bars, HP text, heal/revive preview, life UI).
  // statDisplay.hp/maxHp = stat-row display model + color baseline.
  // statDisplay also owns level and all combat stat rows ({ value, highlightBase }).
  // value = effective (incl. equipment and active effects); highlightBase = level/tier/permanent
  // only. Equipment and active effects drive color; everything else only changes the number.
  statDisplay: UnitStatsSnapshot;

  shape:  UnitShape;

  // Always a fresh copy. Never share the runtime UnitDeployment reference.
  deployment: UnitDeployment;

  // Render-ready sprite data derived by core. UI reads sprite?.textureKey /
  // sprite?.states and never derives texture keys itself. null = no sprite.
  sprite: UnitSpriteSnapshot | null;

  skills:           readonly ActionSkillDefinition[];
  activeSkillIndex: number;
  activeEffects:    readonly ActiveEffect[];

  rowTrait:   RowTrait;
  templateId: string;
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

// All field-deployed bodies (alive and dead, both sides). Read model for corpse
// hover and for placement hit-testing — distinct from BattleOccupancySnapshot,
// which is the living combat-blocker index and reports a corpse cell as empty.
//
// Legal placement forbids overlapping deployments (canPlace rejects dead/dead
// and dead/living overlap), so in practice each cell resolves to exactly one
// unit. cellToUnitIds stays an array as a defensive read-model shape, not as
// permission to overlap. Ordering is deterministic: living first, then dead,
// preserving state.units insertion order within each group. UI may pick the first.
export interface BattleFieldUnitCellsSnapshot {
  cellToUnitIds: Map<string, string[]>;       // cellKey → [unitId, ...]
  unitToCells:   Map<string, CellCoord[]>;    // unitId  → occupied cells (copied)
}

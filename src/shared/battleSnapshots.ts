import type { CellCoord, UnitShape }                from './gridTypes';
import type { Skill }                                from './skillTypes';
import type { SpriteSheetConfig, RowTrait, UnitRace } from './unitTypes';
import type { UnitActivatableAbility }               from './itemTypes';
import type { UnitStatsSnapshot, SkillIconSnapshot } from './snapshotTypes';
import type { ActiveEffect }                         from './activeEffect';

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
  name:     string;
  hp:       number;
  maxHp:    number;

  physicalDamage:      number;
  magicalDamage:       number;
  physicalDefense:     number;
  magicalDefense:      number;
  dodge:               number;
  block:               number;
  level:               number;
  initiative:          number;
  effectiveInitiative:      number; // pre-computed via effectiveStats; used by InitiativeBar
  effectivePhysicalDamage:  number;
  effectiveMagicalDamage:   number;
  effectivePhysicalDefense: number;
  effectiveMagicalDefense:  number;
  effectiveDodge:           number;
  effectiveBlock:           number;

  shape:  UnitShape;
  anchor: CellCoord;

  skills:           readonly Skill[];
  activeSkillIndex: number;
  activeEffects:    readonly ActiveEffect[];

  rowTrait:   RowTrait;
  race?:      UnitRace;
  templateId: string;
  spriteSheet?: SpriteSheetConfig;

  activatableAbilities: readonly UnitActivatableAbility[];
}

// ─── Occupancy snapshot ───────────────────────────────────────────────────────

export interface BattleOccupancySnapshot {
  cellToUnitId: Map<string, string>;       // cellKey → unit id
  unitToCells:  Map<string, CellCoord[]>;  // unit id → occupied cells (copied)
}

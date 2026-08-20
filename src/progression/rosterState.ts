import type { CellCoord } from '../shared/gridTypes';
import type { PartialBattleStatBonuses } from '../shared/itemTypes';
import type { UnitLifeState, UpgradeOptionId } from '../shared/unitTypes';

/**
 * Persistent per-unit player state. Owned by progression/roster.
 * HP invariant:
 *  - alive + currentHp: null   → full HP relative to resolved max HP
 *  - alive + numeric currentHp → concrete persistent HP
 *  - dead requires currentHp: 0
 */
export interface PlayerUnitState {
  level: number;
  isInCamp: boolean;
  lastPlacement: CellCoord | null;
  /** Sparse additive stat bonuses. Missing stat keys mean "no bonus" (0). */
  permanentBonuses: PartialBattleStatBonuses;
  chosenUpgrades: Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>;
  lifeState: UnitLifeState;
  currentHp: number | null;
}

export interface RosterState {
  units: Record<string, PlayerUnitState>;
}

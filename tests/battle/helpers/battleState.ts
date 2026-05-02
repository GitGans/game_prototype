import type { BattleState, Unit } from "../../../src/battle/types";
import { buildOccupancy } from "../../../src/battle/occupancy";

export function makeBattleStateFromUnits(
  units: Unit[],
  overrides: Partial<BattleState> = {},
): BattleState {
  const unitsMap = new Map(units.map((u) => [u.id, u]));
  return {
    units: unitsMap,
    occupancy: buildOccupancy(unitsMap),
    roundQueue: units.map((u) => u.id),
    phase: "select_target",
    validTargets: [],
    benchUnits: [],
    nextPlayerId: 1,
    placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },
    ...overrides,
  };
}

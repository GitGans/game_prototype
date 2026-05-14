import type { BattleState, Unit } from "../../../src/battle/types";
import type { UnitDeployment } from "../../../src/shared/unitDeploymentTypes";
import { buildOccupancy } from "../../../src/battle/occupancy";

// Derives field deployments from unit.anchor.
// Valid in Stage 1 only — anchor still exists on Unit.
function buildDeploymentsFromUnits(units: Map<string, Unit>): Map<string, UnitDeployment> {
  const deployments = new Map<string, UnitDeployment>();
  for (const unit of units.values()) {
    deployments.set(unit.id, { kind: 'field', anchor: unit.anchor });
  }
  return deployments;
}

export function makeBattleStateFromUnits(
  units: Unit[],
  overrides: Partial<BattleState> = {},
): BattleState {
  const unitsMap = new Map(units.map((u) => [u.id, u]));
  const deployments = buildDeploymentsFromUnits(unitsMap);
  return {
    units:              unitsMap,
    occupancy:          buildOccupancy(unitsMap, deployments),
    roundQueue:         units.map((u) => u.id),
    phase:              "select_target",
    validTargets:       [],
    benchUnits:         [],
    nextPlayerId:       1,
    placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },
    deployments,
    benchSlotCount:     0,
    ...overrides,
  };
}

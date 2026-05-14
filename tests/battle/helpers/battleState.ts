import type { BattleState, Unit } from "../../../src/battle/types";
import type { UnitDeployment }    from "../../../src/shared/unitDeploymentTypes";
import type { CellCoord }         from "../../../src/shared/gridTypes";
import { buildOccupancy }         from "../../../src/battle/occupancy";

interface FieldEntry { unit: Unit; anchor: CellCoord }
interface BenchEntry { unit: Unit; slot: number }

export interface BattleStateInput {
  field?:          FieldEntry[];
  bench?:          BenchEntry[];
  benchSlotCount?: number;
}

export function makeBattleStateFromUnits(
  input:     BattleStateInput,
  overrides: Partial<BattleState> = {},
): BattleState {
  const field          = input.field  ?? [];
  const bench          = input.bench  ?? [];
  const benchSlotCount = input.benchSlotCount ?? 0;

  const unitsMap    = new Map<string, Unit>();
  const deployments = new Map<string, UnitDeployment>();

  for (const { unit, anchor } of field) {
    unitsMap.set(unit.id, unit);
    deployments.set(unit.id, { kind: 'field', anchor });
  }
  for (const { unit, slot } of bench) {
    unitsMap.set(unit.id, unit);
    deployments.set(unit.id, { kind: 'bench', slot });
  }

  return {
    units:              unitsMap,
    occupancy:          buildOccupancy(unitsMap, deployments),
    roundQueue:         field.map(e => e.unit.id), // bench units never in the round queue
    phase:              'select_target',
    validTargets:       [],
    benchUnits:         [],
    nextPlayerId:       1,
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
    deployments,
    benchSlotCount,
    ...overrides,
  };
}

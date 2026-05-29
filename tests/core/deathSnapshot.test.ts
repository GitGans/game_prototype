import { describe, it, expect, beforeEach } from 'vitest';
import { killUnit }                       from '../../src/battle/lifeState';
import { buildOccupancy }                 from '../../src/battle/occupancy';
import { buildRoundQueue }                from '../../src/battle/initiative';
import { getLivingFieldUnitEntries }      from '../../src/battle/deployment';
import {
  buildFieldBattleUnitSnapshots,
  buildBattleOccupancySnapshot,
  buildBattleFieldUnitCellsSnapshot,
} from '../../src/core/battleSnapshotBuilder';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';

describe('Stage 4 integration: dead-but-visible snapshot contract', () => {
  beforeEach(() => resetUnitIdCounter());

  it('after lethal damage, a field unit is dead-but-visible across all snapshots', () => {
    const p1 = makeUnit({ id: 'p1', side: 'player' });
    const p2 = makeUnit({ id: 'p2', side: 'player' });
    const e1 = makeUnit({ id: 'e1', side: 'enemy' });

    const state = makeBattleStateFromUnits({
      field: [
        { unit: p1, anchor: { side: 'player', row: 0, col: 0 } },
        { unit: p2, anchor: { side: 'player', row: 0, col: 1 } },
        { unit: e1, anchor: { side: 'enemy',  row: 0, col: 0 } },
      ],
    });

    // killUnit is pure: returns a new Unit. Thread it through a new state.
    const deadP1 = killUnit(state.units.get('p1')!);
    const units  = new Map(state.units);
    units.set('p1', deadP1);

    const nextState = {
      ...state,
      units,
      occupancy: buildOccupancy(units, state.deployments),
    };

    const fieldUnits = buildFieldBattleUnitSnapshots(nextState);
    const occupancy  = buildBattleOccupancySnapshot(nextState);
    const fieldCells = buildBattleFieldUnitCellsSnapshot(nextState);
    const roundQueue = buildRoundQueue(
      new Map(getLivingFieldUnitEntries(nextState)),
    );

    // Present in fieldUnits with lifeState 'dead'
    expect(fieldUnits.find(u => u.id === 'p1')?.lifeState).toBe('dead');

    // Absent from occupancy
    expect(occupancy.unitToCells.has('p1')).toBe(false);

    // Present in fieldUnitCells (corpse remains hoverable)
    expect(fieldCells.unitToCells.has('p1')).toBe(true);

    // Absent from initiative
    expect(roundQueue).not.toContain('p1');
    expect(roundQueue).toContain('p2');
    expect(roundQueue).toContain('e1');
  });
});

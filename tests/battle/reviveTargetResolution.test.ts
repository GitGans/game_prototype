import { describe, it, expect, beforeEach } from 'vitest';
import { resolveReviveTargetsForAction } from '../../src/battle/revive';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import { SHAPES } from '../../src/data/shapeDefinitions';
import type { BattleState } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

const single = { kind: 'effect_area_matrix' as const, matrixName: 'single' };
const cross  = { kind: 'effect_area_matrix' as const, matrixName: 'cross' };

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

beforeEach(() => resetUnitIdCounter());

describe('resolveReviveTargetsForAction', () => {
  it('single matrix anchored on a corpse returns that corpse', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const dead   = makeUnit({ id: 'dead',   side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: dead,   anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, 'dead');

    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 1, 1),
      matrix: single,
    });

    expect(targets.length).toBe(1);
    expect(targets[0].unit.id).toBe('dead');
    expect(targets[0].cells).toEqual([coord('player', 1, 1)]);
  });

  it('returns no targets when anchor is on an empty cell', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: caster, anchor: coord('player', 0, 0) }],
    });

    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 1, 1),
      matrix: single,
    });
    expect(targets).toEqual([]);
  });

  it('returns no targets when anchor is on a living friendly', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const ally   = makeUnit({ id: 'ally',   side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: ally,   anchor: coord('player', 1, 1) },
      ],
    });

    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 1, 1),
      matrix: single,
    });
    expect(targets).toEqual([]);
  });

  it('returns no targets when anchor is on a dead enemy (wrong side)', () => {
    const caster    = makeUnit({ id: 'caster',    side: 'player' });
    const deadEnemy = makeUnit({ id: 'deadEnemy', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,    anchor: coord('player', 0, 0) },
        { unit: deadEnemy, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, 'deadEnemy');

    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('enemy', 0, 0),
      matrix: single,
    });
    expect(targets).toEqual([]);
  });

  it('returns no targets when anchor is on a dead bench unit', () => {
    const caster   = makeUnit({ id: 'caster',   side: 'player' });
    const deadBench = makeUnit({ id: 'deadBench', side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: caster, anchor: coord('player', 0, 0) }],
      bench: [{ unit: deadBench, slot: 0 }],
      benchSlotCount: 1,
    });
    state = setDead(state, 'deadBench');

    // Bench units have no field cell; targeting anywhere on the field won't reach them.
    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 1, 0),
      matrix: single,
    });
    expect(targets).toEqual([]);
  });

  it('AOE clipping one cell of a multi-cell corpse returns the full corpse body cells', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const giant  = makeUnit({ id: 'giant',  side: 'player', shape: SHAPES['1x2'] });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: giant,  anchor: coord('player', 1, 1) }, // occupies (1,1) and (1,2)
      ],
    });
    state = setDead(state, 'giant');

    // single matrix on (1, 1) hits only one cell of the corpse.
    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 1, 1),
      matrix: single,
    });

    expect(targets.length).toBe(1);
    expect(targets[0].unit.id).toBe('giant');
    const cellKeys = targets[0].cells.map((c) => `${c.row},${c.col}`).sort();
    expect(cellKeys).toEqual(['1,1', '1,2']);
  });

  it('AOE covering multiple cells of the same multi-cell corpse dedupes to one target', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const giant  = makeUnit({ id: 'giant',  side: 'player', shape: SHAPES['1x2'] });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: giant,  anchor: coord('player', 0, 1) }, // occupies (0,1) and (0,2)
      ],
    });
    state = setDead(state, 'giant');

    // cross anchored at (0, 1) hits (0,0), (0,1), (0,2), (1,1) — both corpse cells.
    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 0, 1),
      matrix: cross,
    });
    expect(targets.length).toBe(1);
    expect(targets[0].unit.id).toBe('giant');
  });

  it('AOE covering two different corpses returns each exactly once', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const deadA  = makeUnit({ id: 'deadA',  side: 'player' });
    const deadB  = makeUnit({ id: 'deadB',  side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 1, 0) },
        { unit: deadA,  anchor: coord('player', 0, 0) },
        { unit: deadB,  anchor: coord('player', 0, 2) },
      ],
    });
    state = setDead(state, 'deadA');
    state = setDead(state, 'deadB');

    // cross anchored at (0, 1) — empty cell — hits (0,0), (0,1), (0,2), (1,1).
    // Reaches both corpses, each exactly once.
    const { targets } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 0, 1),
      matrix: cross,
    });
    const ids = targets.map((t) => t.unit.id).sort();
    expect(ids).toEqual(['deadA', 'deadB']);
  });

  it('affectedCells contains raw matrix cells, including cells that revive nothing', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const dead   = makeUnit({ id: 'dead',   side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 1, 0) },
        { unit: dead,   anchor: coord('player', 0, 0) },
      ],
    });
    state = setDead(state, 'dead');

    // cross anchored at (0, 1) — empty cell — hits (0,0)[corpse], (0,1)[empty],
    // (0,2)[empty], (1,1)[empty], plus (-1,1) which clips off the board.
    const { targets, affectedCells } = resolveReviveTargetsForAction({
      units: state.units,
      deployments: state.deployments,
      casterSide: 'player',
      targetAnchor: coord('player', 0, 1),
      matrix: cross,
    });

    expect(targets.length).toBe(1);
    // 4 in-bounds cells (the top (-1,1) clips off).
    expect(affectedCells.length).toBe(4);
    const keys = affectedCells.map((c) => `${c.row},${c.col}`).sort();
    expect(keys).toEqual(['0,0', '0,1', '0,2', '1,1']);
  });
});

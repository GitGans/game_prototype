import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSkillTargetsForPolicy,
  getDeadAllyFieldUnitTargets,
} from '../../src/battle/targeting';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import { cellKey } from '../../src/battle/field';
import { getOccupiedCells } from '../../src/battle/shapes';
import type { BattleState } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

beforeEach(() => resetUnitIdCounter());

describe('resolveSkillTargetsForPolicy — living-only ordinary policies', () => {
  it('enemy_melee does not return dead enemy cells', () => {
    const attacker  = makeUnit({ side: 'player' });
    const deadEnemy = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: attacker,  anchor: coord('player', 0, 0) },
        { unit: deadEnemy, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, deadEnemy.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'enemy_melee' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([]);
  });

  it('enemy_ranged does not return dead enemy cells', () => {
    const attacker  = makeUnit({ side: 'player' });
    const deadEnemy = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: attacker,  anchor: coord('player', 0, 0) },
        { unit: deadEnemy, anchor: coord('enemy',  1, 2) },
      ],
    });
    state = setDead(state, deadEnemy.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'enemy_ranged' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([]);
  });

  it('self returns only the caster anchor and is unaffected by nearby corpses', () => {
    const caster   = makeUnit({ side: 'player' });
    const deadAlly = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 0, 1) },
      ],
    });
    state = setDead(state, deadAlly.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'self' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([coord('player', 0, 0)]);
  });

  it('friendly does not return dead ally cells', () => {
    const healer   = makeUnit({ side: 'player' });
    const deadAlly = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: healer,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, deadAlly.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'friendly' }, state, coord('player', 0, 0),
    );
    // Only the healer's own (living) cell should remain.
    expect(cells).toEqual([coord('player', 0, 0)]);
  });
});

describe('resolveSkillTargetsForPolicy — dead_ally_field_unit', () => {
  it('returns dead player ally cells for player caster', () => {
    const caster   = makeUnit({ side: 'player' });
    const deadAlly = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, deadAlly.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([coord('player', 1, 1)]);
  });

  it('returns dead enemy ally cells for enemy caster', () => {
    const caster   = makeUnit({ side: 'enemy' });
    const deadAlly = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('enemy', 0, 0) },
        { unit: deadAlly, anchor: coord('enemy', 1, 2) },
      ],
    });
    state = setDead(state, deadAlly.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('enemy', 0, 0),
    );
    expect(cells).toEqual([coord('enemy', 1, 2)]);
  });

  it('does not return living allies', () => {
    const caster      = makeUnit({ side: 'player' });
    const livingAlly  = makeUnit({ side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: caster,     anchor: coord('player', 0, 0) },
        { unit: livingAlly, anchor: coord('player', 0, 1) },
      ],
    });

    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([]);
  });

  it('does not return dead enemies', () => {
    const caster    = makeUnit({ side: 'player' });
    const deadEnemy = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,    anchor: coord('player', 0, 0) },
        { unit: deadEnemy, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, deadEnemy.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('player', 0, 0),
    );
    expect(cells).toEqual([]);
  });

  it('returns all body cells for a multi-cell dead unit', () => {
    const caster = makeUnit({ side: 'player' });
    const bigDeadAlly = makeUnit({
      side: 'player',
      shape: { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] }, // 1×2
    });
    const anchor = coord('player', 1, 0);
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,      anchor: coord('player', 0, 0) },
        { unit: bigDeadAlly, anchor },
      ],
    });
    state = setDead(state, bigDeadAlly.id);

    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('player', 0, 0),
    );
    expect(cells.map(cellKey).sort())
      .toEqual([coord('player', 1, 0), coord('player', 1, 1)].map(cellKey).sort());
  });

  it('reads deployment+shape, not occupancy — valid state, corpse cells absent from occupancy', () => {
    // Arrange: a living unit on the field — its body cells are in occupancy.
    const caster   = makeUnit({ side: 'player' });
    const ally     = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: ally,   anchor: coord('player', 1, 1) },
      ],
    });
    const allyCells = getOccupiedCells(coord('player', 1, 1), ally.shape);
    for (const c of allyCells) {
      expect(state.occupancy.cellToUnitId.has(cellKey(c))).toBe(true);
    }

    // Act: kill via the production primitive and rebuild occupancy normally.
    state = setDead(state, ally.id);

    // Assert: every previously-occupied corpse cell is gone from occupancy
    // (living-only blocking), but `dead_ally_field_unit` still finds the body
    // through deployment + shape.
    for (const c of allyCells) {
      expect(state.occupancy.cellToUnitId.has(cellKey(c))).toBe(false);
    }
    const cells = resolveSkillTargetsForPolicy(
      { type: 'dead_ally_field_unit' }, state, coord('player', 0, 0),
    );
    expect(cells.map(cellKey).sort()).toEqual(allyCells.map(cellKey).sort());
  });

  it('getDeadAllyFieldUnitTargets is side-relative across both sides at once', () => {
    const playerCaster = makeUnit({ side: 'player' });
    const deadPlayer   = makeUnit({ side: 'player' });
    const enemyCaster  = makeUnit({ side: 'enemy' });
    const deadEnemy    = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: playerCaster, anchor: coord('player', 0, 0) },
        { unit: deadPlayer,   anchor: coord('player', 1, 0) },
        { unit: enemyCaster,  anchor: coord('enemy',  0, 0) },
        { unit: deadEnemy,    anchor: coord('enemy',  1, 0) },
      ],
    });
    state = setDead(state, deadPlayer.id);
    state = setDead(state, deadEnemy.id);

    expect(getDeadAllyFieldUnitTargets(state, 'player'))
      .toEqual([coord('player', 1, 0)]);
    expect(getDeadAllyFieldUnitTargets(state, 'enemy'))
      .toEqual([coord('enemy', 1, 0)]);
  });
});

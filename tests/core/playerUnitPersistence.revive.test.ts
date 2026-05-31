import { describe, it, expect, beforeEach } from 'vitest';
import { applyBattleExitPlayerPersistence } from '../../src/core/playerUnitPersistence';
import { buildPlayerExitInputs } from '../../src/core/playerBattleExitProjection';
import { reviveUnitInBattle, computeReviveHp } from '../../src/battle/revive';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import type { PlayerUnitState } from '../../src/core/GameState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';

beforeEach(() => resetUnitIdCounter());

function makePlayerState(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: 'alive',
    currentHp: null,
    ...overrides,
  };
}

describe('player persistence — revive', () => {
  it('revived player persists as alive with restored HP', () => {
    const target = makeUnit({ id: 'target', side: 'player', templateId: 'hero', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [{ unit: target, anchor: coord('player', 0, 0) }],
    });
    // Kill, then revive.
    const dead = killUnit(state.units.get('target')!);
    const killedUnits = new Map(state.units);
    killedUnits.set('target', dead);
    state = { ...state, units: killedUnits, occupancy: buildOccupancy(killedUnits, state.deployments) };

    const revived = reviveUnitInBattle(state, 'target', { level: 1 })!;
    state = revived.state;

    const exits = buildPlayerExitInputs([{ templateId: 'hero', wasOnBench: false }], state);
    const before: Record<string, PlayerUnitState> = { hero: makePlayerState() };
    const after = applyBattleExitPlayerPersistence(before, exits);

    expect(after.hero!.lifeState).toBe('alive');
    expect(after.hero!.currentHp).toBe(computeReviveHp({ maxHp: 100 }, { level: 1 }));
  });

  it('dead player not revived persists as dead', () => {
    const target = makeUnit({ id: 'target', side: 'player', templateId: 'hero', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [{ unit: target, anchor: coord('player', 0, 0) }],
    });
    const dead = killUnit(state.units.get('target')!);
    const units = new Map(state.units);
    units.set('target', dead);
    state = { ...state, units, occupancy: buildOccupancy(units, state.deployments) };

    const exits = buildPlayerExitInputs([{ templateId: 'hero', wasOnBench: false }], state);
    const before: Record<string, PlayerUnitState> = { hero: makePlayerState() };
    const after = applyBattleExitPlayerPersistence(before, exits);

    expect(after.hero!.lifeState).toBe('dead');
    expect(after.hero!.currentHp).toBe(0);
  });

  it('revived then killed again persists as dead (battle-only revive semantics)', () => {
    const target = makeUnit({ id: 'target', side: 'player', templateId: 'hero', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [{ unit: target, anchor: coord('player', 0, 0) }],
    });
    // Kill → revive → kill again.
    let units = new Map(state.units);
    units.set('target', killUnit(units.get('target')!));
    state = { ...state, units, occupancy: buildOccupancy(units, state.deployments) };

    state = reviveUnitInBattle(state, 'target', { level: 1 })!.state;

    units = new Map(state.units);
    units.set('target', killUnit(units.get('target')!));
    state = { ...state, units, occupancy: buildOccupancy(units, state.deployments) };

    const exits = buildPlayerExitInputs([{ templateId: 'hero', wasOnBench: false }], state);
    const before: Record<string, PlayerUnitState> = { hero: makePlayerState() };
    const after = applyBattleExitPlayerPersistence(before, exits);

    expect(after.hero!.lifeState).toBe('dead');
    expect(after.hero!.currentHp).toBe(0);
  });
});

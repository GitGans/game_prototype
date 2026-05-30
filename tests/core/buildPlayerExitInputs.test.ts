import { describe, it, expect } from 'vitest';
import { makeUnit } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import {
  buildPlayerExitInputs,
  type ExitParticipant,
} from '../../src/core/playerBattleExitProjection';

function withDead(state: ReturnType<typeof makeBattleStateFromUnits>, id: string) {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

describe('buildPlayerExitInputs', () => {
  it('uses isAlive(unit), not state.units.has, for runtime.lifeState (dead unit still present)', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 0, 0) }],
    });
    state = withDead(state, 'h1');

    // Sanity: the dead unit is still in state.units — so state.units.has would say "alive".
    expect(state.units.has('h1')).toBe(true);

    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: false }],
      state,
    );
    expect(exits[0].runtime?.lifeState).toBe('dead');
    expect(exits[0].runtime?.hp).toBe(0);
  });

  it('alive participant projects runtime.lifeState === "alive" with current hp/maxHp', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero', hp: 17, maxHp: 30 });
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 1, 2) }],
    });
    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: false }],
      state,
    );
    expect(exits[0].runtime).toEqual({ hp: 17, maxHp: 30, lifeState: 'alive' });
  });

  it('throws on duplicate templateId among runtime player units', () => {
    const a = makeUnit({ id: 'a', side: 'player', templateId: 'dup' });
    const b = makeUnit({ id: 'b', side: 'player', templateId: 'dup' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: a, anchor: coord('player', 0, 0) },
        { unit: b, anchor: coord('player', 0, 1) },
      ],
    });
    expect(() =>
      buildPlayerExitInputs([{ templateId: 'dup', wasOnBench: false }], state),
    ).toThrow(/duplicate runtime player unit for templateId="dup"/);
  });

  it('does not count enemy units toward the duplicate templateId check', () => {
    const playerHero = makeUnit({ id: 'p', side: 'player', templateId: 'hero' });
    const enemyDoppel = makeUnit({ id: 'e', side: 'enemy', templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: playerHero, anchor: coord('player', 0, 0) },
        { unit: enemyDoppel, anchor: coord('enemy', 0, 0) },
      ],
    });
    expect(() =>
      buildPlayerExitInputs([{ templateId: 'hero', wasOnBench: false }], state),
    ).not.toThrow();
  });

  it('preserves lastFieldPlacement for field-deployed participants', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const anchor = coord('player', 1, 2);
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor }],
    });
    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: false }],
      state,
    );
    expect(exits[0].lastFieldPlacement).toEqual(anchor);
  });

  it('lastFieldPlacement is a clone, not a reference into BattleState.deployments', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 0, 1) }],
    });
    const dep = state.deployments.get('h1');
    if (dep?.kind !== 'field') throw new Error('test setup invariant');

    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: false }],
      state,
    );

    expect(exits[0].lastFieldPlacement).toEqual(dep.anchor); // value-equal
    expect(exits[0].lastFieldPlacement).not.toBe(dep.anchor); // not same identity
  });

  it('lastFieldPlacement is null for bench-deployed participants', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: hero, slot: 0 }],
      benchSlotCount: 1,
    });
    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: true }],
      state,
    );
    expect(exits[0].lastFieldPlacement).toBeNull();
  });

  it('missing runtime + wasOnBench=true → runtime undefined (downstream alive fallback)', () => {
    const state = makeBattleStateFromUnits({}); // no units at all
    const participants: ExitParticipant[] = [{ templateId: 'ghost', wasOnBench: true }];
    const exits = buildPlayerExitInputs(participants, state);
    expect(exits[0]).toEqual({
      templateId: 'ghost',
      wasOnBench: true,
      runtime: undefined,
      lastFieldPlacement: null,
    });
  });

  it('missing runtime + wasOnBench=false → runtime undefined (downstream dead fallback)', () => {
    const state = makeBattleStateFromUnits({});
    const participants: ExitParticipant[] = [{ templateId: 'ghost', wasOnBench: false }];
    const exits = buildPlayerExitInputs(participants, state);
    expect(exits[0]).toEqual({
      templateId: 'ghost',
      wasOnBench: false,
      runtime: undefined,
      lastFieldPlacement: null,
    });
  });

  it('dead field player produces runtime { hp: 0, lifeState: "dead" } and clone of pre-death anchor', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const anchor = coord('player', 1, 2);
    let state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor }],
    });
    state = withDead(state, 'h1');

    const exits = buildPlayerExitInputs(
      [{ templateId: 'hero', wasOnBench: false }],
      state,
    );
    expect(exits[0].runtime?.lifeState).toBe('dead');
    expect(exits[0].runtime?.hp).toBe(0);
    expect(exits[0].lastFieldPlacement).toEqual(anchor);
  });
});

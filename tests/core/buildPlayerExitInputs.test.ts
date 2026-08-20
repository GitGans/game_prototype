import { describe, it, expect } from 'vitest';
import { makeUnit } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import { buildPlayerExitInputs } from '../../src/core/playerBattleExitProjection';

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

    const exits = buildPlayerExitInputs([{ templateId: 'hero' }], state);
    expect(exits[0].runtime.lifeState).toBe('dead');
    expect(exits[0].runtime.hp).toBe(0);
  });

  it('alive participant projects runtime.lifeState === "alive" with current hp/maxHp', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero', hp: 17, maxHp: 30 });
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 1, 2) }],
    });
    const exits = buildPlayerExitInputs([{ templateId: 'hero' }], state);
    expect(exits[0]).toEqual({
      templateId: 'hero',
      runtime: { hp: 17, maxHp: 30, lifeState: 'alive' },
    });
  });

  it('projects bench-deployed participants from runtime state, with no placement output', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero', hp: 9, maxHp: 30 });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: hero, slot: 0 }],
      benchSlotCount: 1,
    });
    const exits = buildPlayerExitInputs([{ templateId: 'hero' }], state);
    // Placement is owned by applyFieldPlacementsToRoster — never projected here.
    expect(exits[0]).toEqual({
      templateId: 'hero',
      runtime: { hp: 9, maxHp: 30, lifeState: 'alive' },
    });
  });

  it('does not count enemy units toward the player correspondence', () => {
    const playerHero  = makeUnit({ id: 'p', side: 'player', templateId: 'hero' });
    const enemyDoppel = makeUnit({ id: 'e', side: 'enemy',  templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: playerHero,  anchor: coord('player', 0, 0) },
        { unit: enemyDoppel, anchor: coord('enemy',  0, 0) },
      ],
    });
    const exits = buildPlayerExitInputs([{ templateId: 'hero' }], state);
    expect(exits).toHaveLength(1);
  });

  // ── Lifecycle corruption: participants and runtime player units are one-to-one ──

  it('throws on duplicate templateId among runtime player units', () => {
    const a = makeUnit({ id: 'a', side: 'player', templateId: 'dup' });
    const b = makeUnit({ id: 'b', side: 'player', templateId: 'dup' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: a, anchor: coord('player', 0, 0) },
        { unit: b, anchor: coord('player', 0, 1) },
      ],
    });
    expect(() => buildPlayerExitInputs([{ templateId: 'dup' }], state))
      .toThrow(/duplicate runtime player unit for templateId "dup"/);
  });

  it('throws on a duplicate participant templateId', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 0, 0) }],
    });
    expect(() => buildPlayerExitInputs([{ templateId: 'hero' }, { templateId: 'hero' }], state))
      .toThrow(/duplicate participant templateId "hero"/);
  });

  it('throws when a participant has no runtime player unit', () => {
    const state = makeBattleStateFromUnits({}); // no units at all
    expect(() => buildPlayerExitInputs([{ templateId: 'ghost' }], state))
      .toThrow(/participant "ghost" has no runtime player unit/);
  });

  it('throws when a runtime player unit has no participant', () => {
    const hero    = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const orphan  = makeUnit({ id: 'h2', side: 'player', templateId: 'stowaway' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: hero,   anchor: coord('player', 0, 0) },
        { unit: orphan, anchor: coord('player', 0, 1) },
      ],
    });
    expect(() => buildPlayerExitInputs([{ templateId: 'hero' }], state))
      .toThrow(/runtime player unit "stowaway" has no battle participant/);
  });

  it('throws when a participant runtime unit has no deployment', () => {
    const hero  = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 0, 0) }],
    });
    const undeployed = { ...state, deployments: new Map() };
    expect(() => buildPlayerExitInputs([{ templateId: 'hero' }], undeployed))
      .toThrow(/participant "hero" has no field or bench deployment/);
  });

  it('dead field player produces runtime { hp: 0, lifeState: "dead" }', () => {
    const hero = makeUnit({ id: 'h1', side: 'player', templateId: 'hero' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: hero, anchor: coord('player', 1, 2) }],
    });
    state = withDead(state, 'h1');

    const exits = buildPlayerExitInputs([{ templateId: 'hero' }], state);
    expect(exits[0].runtime.lifeState).toBe('dead');
    expect(exits[0].runtime.hp).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  getPersistentLifeState,
  getPersistentCurrentHp,
  isPersistentPlayerUnitAlive,
  clampAliveCurrentHp,
  computeBattleExitPlayerPersistence,
  applyBattleExitPlayerPersistence,
  applyVictoryLevelUpPersistence,
  applyFieldPlacementsToRoster,
  type PlayerExitInput,
  type PlayerLevelUpInput,
} from '../../src/core/playerUnitPersistence';
import type { PlayerUnitState } from '../../src/progression';
import { makeUnit } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
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

describe('playerUnitPersistence — read helpers', () => {
  it('defaults missing lifeState to alive', () => {
    expect(getPersistentLifeState(undefined)).toBe('alive');
    expect(getPersistentLifeState({})).toBe('alive');
    expect(getPersistentLifeState({ lifeState: 'dead' })).toBe('dead');
  });

  it('defaults missing currentHp to null', () => {
    expect(getPersistentCurrentHp(undefined)).toBe(null);
    expect(getPersistentCurrentHp({})).toBe(null);
    expect(getPersistentCurrentHp({ currentHp: 7 })).toBe(7);
  });

  it('treats missing lifeState as alive', () => {
    expect(isPersistentPlayerUnitAlive(undefined)).toBe(true);
    expect(isPersistentPlayerUnitAlive({})).toBe(true);
    expect(isPersistentPlayerUnitAlive({ lifeState: 'dead' })).toBe(false);
  });

  it('clampAliveCurrentHp: null → maxHp, clamps 1..maxHp', () => {
    expect(clampAliveCurrentHp(null, 30)).toBe(30);
    expect(clampAliveCurrentHp(0, 30)).toBe(1);
    expect(clampAliveCurrentHp(-5, 30)).toBe(1);
    expect(clampAliveCurrentHp(999, 30)).toBe(30);
    expect(clampAliveCurrentHp(15, 30)).toBe(15);
  });
});

describe('computeBattleExitPlayerPersistence', () => {
  it('runtime dead → dead/0', () => {
    expect(computeBattleExitPlayerPersistence({ hp: 0, maxHp: 30, lifeState: 'dead' }))
      .toEqual({ lifeState: 'dead', currentHp: 0 });
  });

  it('runtime alive at full HP → alive/null', () => {
    expect(computeBattleExitPlayerPersistence({ hp: 30, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'alive', currentHp: null });
  });

  it('runtime alive injured → alive/concrete HP', () => {
    expect(computeBattleExitPlayerPersistence({ hp: 12, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'alive', currentHp: 12 });
  });

  it('hp 0 with stale alive flag is treated as dead', () => {
    expect(computeBattleExitPlayerPersistence({ hp: 0, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'dead', currentHp: 0 });
  });
});

describe('applyBattleExitPlayerPersistence', () => {
  it('runtime alive full → alive/null, placement untouched', () => {
    const placement = coord('player', 1, 2);
    const map = { hero: unit({ lastPlacement: placement }) };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      runtime: { hp: 30, maxHp: 30, lifeState: 'alive' },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('alive');
    expect(next.hero.currentHp).toBe(null);
    // Placement is owned by applyFieldPlacementsToRoster, not by this function.
    expect(next.hero.lastPlacement).toBe(placement);
  });

  it('runtime dead → dead/0', () => {
    const map = { hero: unit() };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      runtime: { hp: 0, maxHp: 30, lifeState: 'dead' },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('dead');
    expect(next.hero.currentHp).toBe(0);
  });

  it('does not mutate input map', () => {
    const map = { hero: unit() };
    const original = map.hero;
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      runtime: { hp: 0, maxHp: 30, lifeState: 'dead' },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(map.hero).toBe(original);
    expect(next).not.toBe(map);
    expect(next.hero).not.toBe(original);
  });

  it('throws on an exit input with no roster record', () => {
    expect(() => applyBattleExitPlayerPersistence({}, [{
      templateId: 'unknown',
      runtime: { hp: 1, maxHp: 30, lifeState: 'alive' },
    }])).toThrow(/no roster record for templateId "unknown"/);
  });
});

describe('applyVictoryLevelUpPersistence', () => {
  it('alive + null currentHp stays null, level advances', () => {
    const map = { hero: unit({ level: 3, lifeState: 'alive', currentHp: null }) };
    const levelUps: PlayerLevelUpInput[] = [{ templateId: 'hero', newLevel: 4, newMaxHp: 50 }];
    const next = applyVictoryLevelUpPersistence(map, levelUps);
    expect(next.hero.level).toBe(4);
    expect(next.hero.lifeState).toBe('alive');
    expect(next.hero.currentHp).toBe(null);
  });

  it('alive + concrete HP exceeding new max → clamped down, no heal', () => {
    const map = { hero: unit({ level: 3, lifeState: 'alive', currentHp: 20 }) };
    const levelUps: PlayerLevelUpInput[] = [{ templateId: 'hero', newLevel: 4, newMaxHp: 15 }];
    const next = applyVictoryLevelUpPersistence(map, levelUps);
    expect(next.hero.currentHp).toBe(15);
  });

  it('alive + concrete HP below new max → preserved (no heal)', () => {
    const map = { hero: unit({ level: 3, lifeState: 'alive', currentHp: 5 }) };
    const levelUps: PlayerLevelUpInput[] = [{ templateId: 'hero', newLevel: 4, newMaxHp: 50 }];
    const next = applyVictoryLevelUpPersistence(map, levelUps);
    expect(next.hero.currentHp).toBe(5);
  });

  it('dead stays dead, level still advances', () => {
    const map = { hero: unit({ level: 3, lifeState: 'dead', currentHp: 0 }) };
    const levelUps: PlayerLevelUpInput[] = [{ templateId: 'hero', newLevel: 4, newMaxHp: 50 }];
    const next = applyVictoryLevelUpPersistence(map, levelUps);
    expect(next.hero.level).toBe(4);
    expect(next.hero.lifeState).toBe('dead');
    expect(next.hero.currentHp).toBe(0);
  });

  it('does not mutate input map', () => {
    const map = { hero: unit({ level: 1 }) };
    const original = map.hero;
    applyVictoryLevelUpPersistence(map, [{ templateId: 'hero', newLevel: 2, newMaxHp: 30 }]);
    expect(map.hero).toBe(original);
    expect(map.hero.level).toBe(1);
  });

  it('throws on a level-up input with no roster record', () => {
    expect(() => applyVictoryLevelUpPersistence({}, [
      { templateId: 'unknown', newLevel: 2, newMaxHp: 30 },
    ])).toThrow(/no roster record for templateId "unknown"/);
  });
});

describe('applyFieldPlacementsToRoster', () => {
  const player = (id: string, templateId: string, overrides: Partial<ReturnType<typeof makeUnit>> = {}) =>
    makeUnit({ id, templateId, side: 'player', ...overrides });

  it('persists field anchors for living and dead players, and leaves bench players alone', () => {
    const roster = {
      units: {
        alive:   unit(),
        corpse:  unit({ lifeState: 'dead', currentHp: 0 }),
        benched: unit({ lastPlacement: coord('player', 1, 2) }),
      },
    };
    const state = makeBattleStateFromUnits({
      field: [
        { unit: player('u1', 'alive'), anchor: coord('player', 0, 0) },
        { unit: player('u2', 'corpse', { lifeState: 'dead', hp: 0 }), anchor: coord('player', 0, 1) },
      ],
      bench: [{ unit: player('u3', 'benched'), slot: 0 }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    const next = applyFieldPlacementsToRoster(roster, state);

    expect(next.units.alive.lastPlacement).toEqual(coord('player', 0, 0));
    expect(next.units.corpse.lastPlacement).toEqual(coord('player', 0, 1));
    expect(next.units.benched.lastPlacement).toEqual(coord('player', 1, 2));
  });

  it('ignores enemy field units and leaves absent roster units untouched', () => {
    const roster = { units: { alive: unit(), reserve: unit() } };
    const state = makeBattleStateFromUnits({
      field: [
        { unit: player('u1', 'alive'), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'e1', templateId: 'reserve', side: 'enemy' }), anchor: coord('enemy', 0, 0) },
      ],
    }, { phase: 'placement' });

    const next = applyFieldPlacementsToRoster(roster, state);

    // The enemy deliberately shares the 'reserve' templateId: side, not templateId, decides.
    expect(next.units.reserve).toBe(roster.units.reserve);
    expect(next.units.reserve.lastPlacement).toBeNull();
  });

  it('never mutates or aliases the input roster or runtime anchors', () => {
    const roster = { units: { alive: unit() } };
    const before = roster.units.alive;
    const anchor = coord('player', 1, 1);
    const state = makeBattleStateFromUnits({
      field: [{ unit: player('u1', 'alive'), anchor }],
    }, { phase: 'placement' });

    const next = applyFieldPlacementsToRoster(roster, state);

    expect(next).not.toBe(roster);
    expect(next.units.alive).not.toBe(before);
    expect(before.lastPlacement).toBeNull();                  // input record untouched
    expect(next.units.alive.lastPlacement).not.toBe(anchor);  // copied, not aliased
    expect(state.deployments.get('u1')).toEqual({ kind: 'field', anchor });
  });

  it('throws when a field player has no roster record', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: player('u1', 'ghost'), anchor: coord('player', 0, 0) }],
    }, { phase: 'placement' });

    expect(() => applyFieldPlacementsToRoster({ units: {} }, state)).toThrow(/ghost/);
  });
});

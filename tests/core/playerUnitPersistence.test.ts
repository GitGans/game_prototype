import { describe, it, expect } from 'vitest';
import {
  getPersistentLifeState,
  getPersistentCurrentHp,
  isPersistentPlayerUnitAlive,
  clampAliveCurrentHp,
  computeFieldPlayerPersistence,
  applyBattleExitPlayerPersistence,
  applyVictoryLevelUpPersistence,
  type PlayerExitInput,
  type PlayerLevelUpInput,
} from '../../src/core/playerUnitPersistence';
import type { PlayerUnitState } from '../../src/core/GameState';

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

describe('computeFieldPlayerPersistence', () => {
  it('missing runtime → dead/0', () => {
    expect(computeFieldPlayerPersistence(undefined)).toEqual({ lifeState: 'dead', currentHp: 0 });
  });

  it('runtime dead → dead/0', () => {
    expect(computeFieldPlayerPersistence({ hp: 0, maxHp: 30, lifeState: 'dead' }))
      .toEqual({ lifeState: 'dead', currentHp: 0 });
  });

  it('runtime alive at full HP → alive/null', () => {
    expect(computeFieldPlayerPersistence({ hp: 30, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'alive', currentHp: null });
  });

  it('runtime alive injured → alive/concrete HP', () => {
    expect(computeFieldPlayerPersistence({ hp: 12, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'alive', currentHp: 12 });
  });

  it('hp 0 with stale alive flag is treated as dead', () => {
    expect(computeFieldPlayerPersistence({ hp: 0, maxHp: 30, lifeState: 'alive' }))
      .toEqual({ lifeState: 'dead', currentHp: 0 });
  });
});

describe('applyBattleExitPlayerPersistence', () => {
  it('runtime alive full → alive/null + lastPlacement updated', () => {
    const map = { hero: unit({ lastPlacement: null }) };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      wasOnBench: false,
      runtime: { hp: 30, maxHp: 30, lifeState: 'alive' },
      lastFieldPlacement: { side: 'player', row: 0, col: 0 },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('alive');
    expect(next.hero.currentHp).toBe(null);
    expect(next.hero.lastPlacement).toEqual({ side: 'player', row: 0, col: 0 });
  });

  it('runtime dead → dead/0 + lastPlacement preserved when set', () => {
    const map = { hero: unit() };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      wasOnBench: false,
      runtime: { hp: 0, maxHp: 30, lifeState: 'dead' },
      lastFieldPlacement: { side: 'player', row: 1, col: 2 },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('dead');
    expect(next.hero.currentHp).toBe(0);
    expect(next.hero.lastPlacement).toEqual({ side: 'player', row: 1, col: 2 });
  });

  it('bench-origin moved to field and killed: runtime dead wins over wasOnBench=true', () => {
    // The participant was on the bench at battle start (wasOnBench=true), but
    // mid-battle was placed on the field and killed there. The runtime snapshot
    // reflects death and must take precedence over the wasOnBench fallback.
    const map = { hero: unit({ lifeState: 'alive', currentHp: null }) };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      wasOnBench: true, // started on bench
      runtime: { hp: 0, maxHp: 30, lifeState: 'dead' }, // ... but died on the field
      lastFieldPlacement: { side: 'player', row: 1, col: 0 },
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('dead');
    expect(next.hero.currentHp).toBe(0);
    expect(next.hero.lastPlacement).toEqual({ side: 'player', row: 1, col: 0 });
  });

  it('runtime missing + wasOnBench → alive, currentHp preserved as null when absent', () => {
    const map = { hero: unit({ currentHp: null }) };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      wasOnBench: true,
      runtime: undefined,
      lastFieldPlacement: null,
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(next.hero.lifeState).toBe('alive');
    expect(next.hero.currentHp).toBe(null);
    expect(next.hero.lastPlacement).toBe(null);
  });

  it('runtime missing + wasOnBench false → dead/0', () => {
    const map = { hero: unit() };
    const exits: PlayerExitInput[] = [{
      templateId: 'hero',
      wasOnBench: false,
      runtime: undefined,
      lastFieldPlacement: null,
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
      wasOnBench: false,
      runtime: { hp: 0, maxHp: 30, lifeState: 'dead' },
      lastFieldPlacement: null,
    }];
    const next = applyBattleExitPlayerPersistence(map, exits);
    expect(map.hero).toBe(original);
    expect(next).not.toBe(map);
    expect(next.hero).not.toBe(original);
  });

  it('skips unknown templateIds without throwing', () => {
    const next = applyBattleExitPlayerPersistence({}, [{
      templateId: 'unknown',
      wasOnBench: false,
      runtime: undefined,
      lastFieldPlacement: null,
    }]);
    expect(next).toEqual({});
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
});

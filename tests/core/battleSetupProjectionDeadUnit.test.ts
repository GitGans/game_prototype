import { describe, it, expect } from 'vitest';
import { buildPlayerAutoPlacementCandidates } from '../../src/core/battleSetupProjection';
import { PLAYER_UNITS } from '../../src/data/units';
import type { PlayerBattleSetup } from '../../src/core/battleSetup';
import type { PlayerUnitState } from '../../src/core/GameState';

function makeSetup(overrides: Record<string, Partial<PlayerUnitState>> = {}): PlayerBattleSetup {
  const playerUnits: Record<string, PlayerUnitState> = {};
  for (const bp of PLAYER_UNITS) {
    playerUnits[bp.templateId] = {
      level: bp.level,
      isInCamp: false,
      lastPlacement: null,
      permanentBonuses: {},
      chosenUpgrades: {},
      lifeState: 'alive',
      currentHp: null,
      ...(overrides[bp.templateId] ?? {}),
    };
  }
  return { playerUnits, itemContainers: {}, itemInstances: {} };
}

describe('buildPlayerAutoPlacementCandidates — dead-unit filter', () => {
  it('persistent dead player unit is excluded', () => {
    const dead = PLAYER_UNITS[0].templateId;
    const setup = makeSetup({ [dead]: { lifeState: 'dead', currentHp: 0 } });
    const ids = buildPlayerAutoPlacementCandidates(setup).map(c => c.templateId);
    expect(ids).not.toContain(dead);
  });

  it('dead unit with lastPlacement is still excluded', () => {
    const dead = PLAYER_UNITS[0].templateId;
    const setup = makeSetup({
      [dead]: {
        lifeState: 'dead',
        currentHp: 0,
        lastPlacement: { side: 'player', row: 0, col: 0 },
      },
    });
    const ids = buildPlayerAutoPlacementCandidates(setup).map(c => c.templateId);
    expect(ids).not.toContain(dead);
  });

  it('alive currentHp: null enters at full max HP', () => {
    const tpl = PLAYER_UNITS[0].templateId;
    const setup = makeSetup();
    const candidate = buildPlayerAutoPlacementCandidates(setup).find(c => c.templateId === tpl)!;
    expect(candidate).toBeDefined();
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
  });

  it('alive concrete currentHp enters at clamped HP', () => {
    const tpl = PLAYER_UNITS[0].templateId;
    const setup = makeSetup({ [tpl]: { currentHp: 3 } });
    const candidate = buildPlayerAutoPlacementCandidates(setup).find(c => c.templateId === tpl)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(3);
    expect(unit.maxHp).toBeGreaterThan(3);
  });

  it('currentHp above max is clamped down', () => {
    const tpl = PLAYER_UNITS[0].templateId;
    const setup = makeSetup({ [tpl]: { currentHp: 9999 } });
    const candidate = buildPlayerAutoPlacementCandidates(setup).find(c => c.templateId === tpl)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
  });

  it('camp + alive predicate: camp excludes, dead excludes, alive non-camp included', () => {
    const a = PLAYER_UNITS[0].templateId;
    const b = PLAYER_UNITS[1].templateId;
    const c = PLAYER_UNITS[2].templateId;
    const setup = makeSetup({
      [a]: { isInCamp: true },
      [b]: { lifeState: 'dead', currentHp: 0 },
    });
    const ids = buildPlayerAutoPlacementCandidates(setup).map(x => x.templateId);
    expect(ids).not.toContain(a);
    expect(ids).not.toContain(b);
    expect(ids).toContain(c);
  });
});

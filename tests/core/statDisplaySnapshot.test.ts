import { describe, it, expect, beforeEach } from 'vitest';
import { buildBattleUnitSnapshots } from '../../src/core/battleSnapshotBuilder';
import { resolveStatTone } from '../../src/shared/statHighlight';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import type { UnitBattleStats } from '../../src/shared/unitTypes';
import type { ActiveEffect } from '../../src/shared/activeEffect';
import { killUnit } from '../../src/battle/lifeState';

// Highlight baseline (no equipment). Combat physicalStrength is overridden separately
// to simulate an equipment bonus = combat − baseline.
function baseline(physicalStrength: number): UnitBattleStats {
  return {
    hp: 100, physicalStrength, magicalStrength: 10,
    physicalDefense: 0, magicalDefense: 0, dodge: 0, block: 0, initiative: 10,
  };
}

function physStrEffect(bonus: number): ActiveEffect {
  return {
    effectDisplayName: bonus >= 0 ? 'Buff' : 'Debuff',
    remainingRounds: 2,
    effect: {
      id: 'test_fx',
      effectTone: bonus >= 0 ? 'positive' : 'negative',
      physicalStrengthBonus: bonus,
    },
  };
}

// Builds a single-unit battle state and returns that unit's statDisplay.physicalStrength pair.
function physStrPair(opts: { combat: number; baseline: number; effects?: ActiveEffect[]; dead?: boolean }) {
  let unit = makeUnit({
    id: 'p',
    side: 'player',
    physicalStrength: opts.combat,
    statHighlightBaseStats: baseline(opts.baseline),
    activeEffects: opts.effects ?? [],
  });
  if (opts.dead) unit = killUnit(unit);
  const state = makeBattleStateFromUnits({
    field: [{ unit, anchor: { side: 'player', row: 0, col: 0 } }],
  });
  return buildBattleUnitSnapshots(state)[0].statDisplay.physicalStrength;
}

describe('battle statDisplay — equipment + effects net coloring', () => {
  beforeEach(() => resetUnitIdCounter());

  it('equipment with no active effects → positive equipment delta', () => {
    const p = physStrPair({ combat: 30, baseline: 20 });   // equipment +10
    expect(p.value).toBe(30);
    expect(p.highlightBase).toBe(20);
    expect(resolveStatTone(p.value, p.highlightBase)).toBe('positive');
  });

  it('active buff stacks on top of equipment', () => {
    const p = physStrPair({ combat: 30, baseline: 20, effects: [physStrEffect(5)] }); // +10 equip, +5 buff
    expect(p.value).toBe(35);
    expect(p.highlightBase).toBe(20);
    expect(resolveStatTone(p.value, p.highlightBase)).toBe('positive');
  });

  it('active debuff can overcome an equipment bonus → net negative', () => {
    const p = physStrPair({ combat: 30, baseline: 20, effects: [physStrEffect(-15)] }); // +10 equip, -15 debuff
    expect(p.value).toBe(15);
    expect(p.highlightBase).toBe(20);
    expect(resolveStatTone(p.value, p.highlightBase)).toBe('negative');
  });

  it('equipment +X and debuff -X cancel → neutral', () => {
    const p = physStrPair({ combat: 30, baseline: 20, effects: [physStrEffect(-10)] }); // +10 equip, -10 debuff
    expect(p.value).toBe(20);
    expect(p.highlightBase).toBe(20);
    expect(resolveStatTone(p.value, p.highlightBase)).toBe('neutral');
  });

  it('death clears effects → delta returns to equipment-only', () => {
    const debuffed = physStrPair({ combat: 30, baseline: 20, effects: [physStrEffect(-15)] });
    expect(resolveStatTone(debuffed.value, debuffed.highlightBase)).toBe('negative');

    const afterDeath = physStrPair({ combat: 30, baseline: 20, effects: [physStrEffect(-15)], dead: true });
    expect(afterDeath.value).toBe(30);           // effect gone, equipment remains
    expect(afterDeath.highlightBase).toBe(20);
    expect(resolveStatTone(afterDeath.value, afterDeath.highlightBase)).toBe('positive');
  });

  it('HP row: current-HP damage does not color the stat; maxHp carries the equipment delta', () => {
    const unit = makeUnit({
      id: 'p', side: 'player',
      hp: 40, maxHp: 110,                           // 110 combat max hp (incl. +10 equipment)
      statHighlightBaseStats: { ...baseline(20), hp: 100 },  // 100 no-equipment max hp
    });
    const state = makeBattleStateFromUnits({
      field: [{ unit, anchor: { side: 'player', row: 0, col: 0 } }],
    });
    const sd = buildBattleUnitSnapshots(state)[0].statDisplay;

    // hp stays neutral despite being at 40/110
    expect(resolveStatTone(sd.hp.value, sd.hp.highlightBase)).toBe('neutral');
    // maxHp colors on the equipment max-HP delta (110 vs 100)
    expect(sd.maxHp.value).toBe(110);
    expect(sd.maxHp.highlightBase).toBe(100);
    expect(resolveStatTone(sd.maxHp.value, sd.maxHp.highlightBase)).toBe('positive');
  });
});

describe('battle statDisplay — enemy with no equipment is neutral by default', () => {
  beforeEach(() => resetUnitIdCounter());

  it('combat stats == highlight baseline → neutral when no effects', () => {
    // makeUnit defaults statHighlightBaseStats to mirror its own stats.
    const unit = makeUnit({ id: 'e', side: 'enemy' });
    const state = makeBattleStateFromUnits({
      field: [{ unit, anchor: { side: 'enemy', row: 0, col: 0 } }],
    });
    const sd = buildBattleUnitSnapshots(state)[0].statDisplay;
    expect(resolveStatTone(sd.physicalStrength.value, sd.physicalStrength.highlightBase)).toBe('neutral');
  });
});

import { describe, it, expect } from 'vitest';
import type { UnitBlueprint } from '../../src/shared/unitTypes';
import {
  buildUnitStatsSnapshot, type UnitStatsHealthInput,
} from '../../src/core/unitStatsSnapshot';
import { equipment, instance, def } from '../inventory/helpers';

const bp = {
  templateId: 'test',
  hp: 100, physicalStrength: 50, magicalStrength: 30,
  physicalDefense: 10, magicalDefense: 8,
  dodge: 5, block: 4, initiative: 7,
} as unknown as UnitBlueprint;

/** Full health in the sparse roster form — the health input for every stat-focused case. */
const FULL: UnitStatsHealthInput = { currentHp: null, lifeState: 'alive' };

describe('buildUnitStatsSnapshot — highlight baseline semantics', () => {
  it('equipment bonus creates a positive highlight delta', () => {
    const defs = { helm: def('helm', { battleStatBonuses: { physicalDefense: 2 } }) };
    const insts = { i_helm: instance('i_helm', 'helm') };
    const containers = { equip_test: equipment('test', { helmet: 'i_helm' }) };

    const snap = buildUnitStatsSnapshot(bp, 5, {}, containers, insts, defs, {}, FULL);

    expect(snap.physicalDefense.value - snap.physicalDefense.highlightBase).toBe(2);
    expect(snap.physicalDefense.value).toBeGreaterThan(snap.physicalDefense.highlightBase);
    // a stat the item does not touch stays neutral
    expect(snap.physicalStrength.value).toBe(snap.physicalStrength.highlightBase);
  });

  it('equipment penalty creates a negative highlight delta', () => {
    const defs = { cursed: def('cursed', { battleStatBonuses: { physicalStrength: -5 } }) };
    const insts = { i_c: instance('i_c', 'cursed') };
    const containers = { equip_test: equipment('test', { helmet: 'i_c' }) };

    const snap = buildUnitStatsSnapshot(bp, 5, {}, containers, insts, defs, {}, FULL);

    expect(snap.physicalStrength.value).toBeLessThan(snap.physicalStrength.highlightBase);
    expect(snap.physicalStrength.value - snap.physicalStrength.highlightBase).toBe(-5);
  });

  it('tier upgrade changes the value but NOT the highlight delta', () => {
    const snap = buildUnitStatsSnapshot(bp, 5, {}, {}, {}, {}, { physicalStrength: 10 }, FULL);

    // level 5 base physStr = round(50 * 1.42) = 71; +10 upgrade = 81
    expect(snap.physicalStrength.value).toBe(81);
    // upgrade is in BOTH value and highlightBase → no color
    expect(snap.physicalStrength.value).toBe(snap.physicalStrength.highlightBase);
  });

  it('permanent bonus changes the value but NOT the highlight delta', () => {
    const snap = buildUnitStatsSnapshot(bp, 5, { hp: 5 }, {}, {}, {}, {}, FULL);

    // permanent bonus is in BOTH value and highlightBase → no color
    expect(snap.hp.value).toBe(snap.hp.highlightBase);
    expect(snap.maxHp.value).toBe(snap.maxHp.highlightBase);
  });

  it('equipment bonus to dodge/block/initiative creates a positive highlight delta — previously excluded, now fixed', () => {
    const defs = { boots: def('boots', { battleStatBonuses: { dodge: 3, block: 2, initiative: 1 } }) };
    const insts = { i_boots: instance('i_boots', 'boots') };
    const containers = { equip_test: equipment('test', { boots: 'i_boots' }) };

    const snap = buildUnitStatsSnapshot(bp, 5, {}, containers, insts, defs, {}, FULL);

    expect(snap.dodge.value - snap.dodge.highlightBase).toBe(3);
    expect(snap.block.value - snap.block.highlightBase).toBe(2);
    expect(snap.initiative.value - snap.initiative.highlightBase).toBe(1);
  });

  it('permanent bonus to dodge/block/initiative changes value AND highlight delta — previously excluded, now fixed', () => {
    const snap = buildUnitStatsSnapshot(bp, 5, { dodge: 2, block: 1, initiative: 3 }, {}, {}, {}, {}, FULL);

    expect(snap.dodge.value).toBe(snap.dodge.highlightBase);
    expect(snap.dodge.value).toBe(7); // 5 + 2
    expect(snap.block.value).toBe(5); // 4 + 1
    expect(snap.initiative.value).toBe(10); // 7 + 3
  });
});

/**
 * `hp` is CURRENT HP, `maxHp` the resolved ceiling — the same split
 * `battleSnapshotBuilder.ts` produces for the runtime. Every expectation here is derived
 * from `maxHp.value`, never from a literal total, so content rebalancing cannot break it.
 */
describe('buildUnitStatsSnapshot — current HP projection', () => {
  const build = (health: UnitStatsHealthInput, level = 5) =>
    buildUnitStatsSnapshot(bp, level, {}, {}, {}, {}, {}, health);

  it('preserves a wounded current HP and leaves the resolved maximum alone', () => {
    const max = build(FULL).maxHp.value;
    const snap = build({ currentHp: 90, lifeState: 'alive' });

    expect(snap.hp.value).toBe(90);
    expect(snap.hp.value).toBeLessThan(snap.maxHp.value);
    expect(snap.maxHp.value).toBe(max);
  });

  it('shows the resolved maximum for the sparse full-HP form at every level', () => {
    for (const level of [1, 5, 10]) {
      const snap = build(FULL, level);
      expect(snap.hp.value).toBe(snap.maxHp.value);
    }
  });

  it('shows 0 for a dead character, with the normal resolved maximum', () => {
    const snap = build({ currentHp: 0, lifeState: 'dead' });

    expect(snap.hp.value).toBe(0);
    expect(snap.maxHp.value).toBe(build(FULL).maxHp.value);
  });

  it('life state wins over a stale numeric HP on a dead character', () => {
    // clampAliveCurrentHp has a floor of 1, so death must be decided BEFORE it.
    expect(build({ currentHp: 40, lifeState: 'dead' }).hp.value).toBe(0);
  });

  it('caps a living current HP above the maximum for display, without mutating the input', () => {
    const health: UnitStatsHealthInput = { currentHp: 9999, lifeState: 'alive' };
    const snap = build(health);

    expect(snap.hp.value).toBe(snap.maxHp.value);
    // The projection normalizes for DISPLAY only — writing back is the roster's job.
    expect(health).toEqual({ currentHp: 9999, lifeState: 'alive' });
  });

  it('equipment and upgrades raise the maximum without replacing a wounded current HP', () => {
    const defs = { amulet: def('amulet', { battleStatBonuses: { hp: 20 } }) };
    const insts = { i_am: instance('i_am', 'amulet') };
    const containers = { equip_test: equipment('test', { helmet: 'i_am' }) };

    const bare = build({ currentHp: 90, lifeState: 'alive' });
    const geared = buildUnitStatsSnapshot(
      bp, 5, {}, containers, insts, defs, { hp: 7 }, { currentHp: 90, lifeState: 'alive' },
    );

    expect(geared.maxHp.value).toBe(bare.maxHp.value + 27);
    expect(geared.hp.value).toBe(90);
  });

  it('keeps the hp pair neutral for every health input, so injury never reads as a debuff', () => {
    const inputs: UnitStatsHealthInput[] = [
      FULL,
      { currentHp: 90, lifeState: 'alive' },
      { currentHp: 9999, lifeState: 'alive' },
      { currentHp: 0, lifeState: 'dead' },
    ];

    for (const health of inputs) {
      const snap = build(health);
      expect(snap.hp.value).toBe(snap.hp.highlightBase);
      // The row's colour comes from maxHp, which stays a genuine equipment-delta pair.
      expect(snap.maxHp.highlightBase).toBe(snap.maxHp.value);
    }
  });
});

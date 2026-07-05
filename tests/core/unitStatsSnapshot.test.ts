import { describe, it, expect } from 'vitest';
import type { UnitBlueprint } from '../../src/shared/unitTypes';
import { buildUnitStatsSnapshot } from '../../src/core/unitStatsSnapshot';
import { equipment, instance, def } from '../inventory/helpers';

const bp = {
  templateId: 'test',
  hp: 100, physicalStrength: 50, magicalStrength: 30,
  physicalDefense: 10, magicalDefense: 8,
  dodge: 5, block: 4, initiative: 7,
} as unknown as UnitBlueprint;

describe('buildUnitStatsSnapshot — highlight baseline semantics', () => {
  it('equipment bonus creates a positive highlight delta', () => {
    const defs = { helm: def('helm', { battleStatBonuses: { physicalDefense: 2 } }) };
    const insts = { i_helm: instance('i_helm', 'helm') };
    const containers = { equip_test: equipment('test', { helmet: 'i_helm' }) };

    const snap = buildUnitStatsSnapshot(bp, 5, {}, containers, insts, defs, {});

    expect(snap.physicalDefense.value - snap.physicalDefense.highlightBase).toBe(2);
    expect(snap.physicalDefense.value).toBeGreaterThan(snap.physicalDefense.highlightBase);
    // a stat the item does not touch stays neutral
    expect(snap.physicalStrength.value).toBe(snap.physicalStrength.highlightBase);
  });

  it('equipment penalty creates a negative highlight delta', () => {
    const defs = { cursed: def('cursed', { battleStatBonuses: { physicalStrength: -5 } }) };
    const insts = { i_c: instance('i_c', 'cursed') };
    const containers = { equip_test: equipment('test', { helmet: 'i_c' }) };

    const snap = buildUnitStatsSnapshot(bp, 5, {}, containers, insts, defs, {});

    expect(snap.physicalStrength.value).toBeLessThan(snap.physicalStrength.highlightBase);
    expect(snap.physicalStrength.value - snap.physicalStrength.highlightBase).toBe(-5);
  });

  it('tier upgrade changes the value but NOT the highlight delta', () => {
    const snap = buildUnitStatsSnapshot(bp, 5, {}, {}, {}, {}, { physicalStrength: 10 });

    // level 5 base physStr = round(50 * 1.42) = 71; +10 upgrade = 81
    expect(snap.physicalStrength.value).toBe(81);
    // upgrade is in BOTH value and highlightBase → no color
    expect(snap.physicalStrength.value).toBe(snap.physicalStrength.highlightBase);
  });

  it('permanent bonus changes the value but NOT the highlight delta', () => {
    const snap = buildUnitStatsSnapshot(bp, 5, { hp: 5 }, {}, {}, {}, {});

    // permanent bonus is in BOTH value and highlightBase → no color
    expect(snap.hp.value).toBe(snap.hp.highlightBase);
    expect(snap.maxHp.value).toBe(snap.maxHp.highlightBase);
  });
});

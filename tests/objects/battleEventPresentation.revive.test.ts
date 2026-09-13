import { describe, it, expect } from 'vitest';
import { buildBattleEventPresentations } from '../../src/objects/battleEventPresentation';
import type { BattleEvent } from '../../src/battle/battleEvents';

describe('battleEventPresentation — unit_revived', () => {
  it('produces a revive log entry and heal-style floating text', () => {
    const event: BattleEvent = {
      type: 'unit_revived',
      casterId: 'c',  casterName: 'Healer',
      targetId: 't',  targetName: 'Knight',
      amount: 10,
    };
    const [presentation] = buildBattleEventPresentations([event], {
      activeUnitSide: 'player',
    });

    expect(presentation.floatingText).toEqual({
      unitId: 't',
      kind: 'heal',
      amount: 10,
    });
    expect(presentation.logEntry?.text).toBe('Healer revived Knight +10');
    expect(presentation.logEntry?.type).toBe('positive');
  });
});

describe('battleEventPresentation — item_revive', () => {
  it('names the item and both units, and floats the restored HP over the revived unit', () => {
    const event: BattleEvent = {
      type: 'item_revive',
      unitId: 'o', unitName: 'Warrior',
      targetId: 't', targetName: 'Archer',
      itemName: 'Small Resurrection Scroll',
      amount: 21,
    };
    const [presentation] = buildBattleEventPresentations([event], {
      activeUnitSide: 'player',
    });

    expect(presentation.floatingText).toEqual({ unitId: 't', kind: 'heal', amount: 21 });
    expect(presentation.logEntry).toEqual({
      text: 'Warrior reads Small Resurrection Scroll and revives Archer +21 HP',
      type: 'positive',
    });
  });
});

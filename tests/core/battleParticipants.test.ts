import { describe, it, expect, beforeEach } from 'vitest';
import { buildInitialBattleParticipants } from '../../src/core/battleParticipants';
import { getUnitSpriteTextureKey } from '../../src/core/unitSpriteKey';
import type { PlayerInitialPlacement } from '../../src/battle/autoPlace';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';

const SHEET = { path: 'x.png', frameWidth: 32, frameHeight: 32, states: ['idle', 'attack', 'death'] };

beforeEach(() => resetUnitIdCounter());

function fieldPlacement(templateId: string, unitId: string, row: 0 | 1, col: 0 | 1 | 2): PlayerInitialPlacement {
  return { templateId, unitId, deployment: { kind: 'field', anchor: coord('player', row, col) } };
}

function benchPlacement(templateId: string, unitId: string, slot: number): PlayerInitialPlacement {
  return { templateId, unitId, deployment: { kind: 'bench', slot } };
}

describe('buildInitialBattleParticipants', () => {
  it('includes an initially dead unit with isAlive: false', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'p1', templateId: 'alice', side: 'player' }), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'p2', templateId: 'bob', side: 'player', lifeState: 'dead', hp: 0 }), anchor: coord('player', 0, 1) },
      ],
    });

    const participants = buildInitialBattleParticipants(state, [
      fieldPlacement('alice', 'p1', 0, 0),
      fieldPlacement('bob',   'p2', 0, 1),
    ]);

    expect(participants.map(p => [p.templateId, p.isAlive])).toEqual([
      ['alice', true],
      ['bob',   false],
    ]);
  });

  it('derives wasOnBench from the placement record, not current deployments', () => {
    const state = makeBattleStateFromUnits({
      bench: [{ unit: makeUnit({ id: 'p1', templateId: 'alice', side: 'player' }), slot: 0 }],
      benchSlotCount: 3,
    });
    const placements = [benchPlacement('alice', 'p1', 0)];

    expect(buildInitialBattleParticipants(state, placements)[0].wasOnBench).toBe(true);

    // Move the unit to the field AFTER battle start — the record is authoritative.
    state.deployments.set('p1', { kind: 'field', anchor: coord('player', 0, 0) });
    expect(buildInitialBattleParticipants(state, placements)[0].wasOnBench).toBe(true);
  });

  it('preserves placement-record order', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'p1', templateId: 'alpha', side: 'player' }), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'p2', templateId: 'beta',  side: 'player' }), anchor: coord('player', 0, 1) },
        { unit: makeUnit({ id: 'p3', templateId: 'gamma', side: 'player' }), anchor: coord('player', 0, 2) },
      ],
    });

    const participants = buildInitialBattleParticipants(state, [
      fieldPlacement('gamma', 'p3', 0, 2),
      fieldPlacement('alpha', 'p1', 0, 0),
      fieldPlacement('beta',  'p2', 0, 1),
    ]);

    expect(participants.map(p => p.templateId)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('copies name and level from the runtime unit and builds spriteKey from its sheet', () => {
    const state = makeBattleStateFromUnits({
      field: [{
        unit: makeUnit({ id: 'p1', templateId: 'alice', name: 'Alice', level: 7, side: 'player', spriteSheet: SHEET }),
        anchor: coord('player', 0, 0),
      }],
    });

    const [p] = buildInitialBattleParticipants(state, [fieldPlacement('alice', 'p1', 0, 0)]);
    expect(p.name).toBe('Alice');
    expect(p.level).toBe(7);
    expect(p.spriteKey).toBe(getUnitSpriteTextureKey('alice', SHEET));
  });

  it('returns spriteKey: null when the runtime unit has no sprite sheet', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'p1', templateId: 'alice', side: 'player' }), anchor: coord('player', 0, 0) }],
    });
    expect(buildInitialBattleParticipants(state, [fieldPlacement('alice', 'p1', 0, 0)])[0].spriteKey).toBeNull();
  });

  it('returns fresh participant objects on every call', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'p1', templateId: 'alice', side: 'player' }), anchor: coord('player', 0, 0) }],
    });
    const placements = [fieldPlacement('alice', 'p1', 0, 0)];
    expect(buildInitialBattleParticipants(state, placements)[0])
      .not.toBe(buildInitialBattleParticipants(state, placements)[0]);
  });
});

describe('buildInitialBattleParticipants — invariant violations throw', () => {
  const state = () => makeBattleStateFromUnits({
    field: [
      { unit: makeUnit({ id: 'p1', templateId: 'alice', side: 'player' }), anchor: coord('player', 0, 0) },
      { unit: makeUnit({ id: 'e1', templateId: 'orc',   side: 'enemy'  }), anchor: coord('enemy', 0, 0) },
    ],
  });

  it('throws for an unknown unitId', () => {
    expect(() => buildInitialBattleParticipants(state(), [fieldPlacement('alice', 'ghost', 0, 0)]))
      .toThrow(/no runtime unit/);
  });

  it('throws when the record points at an enemy unit', () => {
    expect(() => buildInitialBattleParticipants(state(), [fieldPlacement('orc', 'e1', 0, 0)]))
      .toThrow(/not a player unit/);
  });

  it('throws on a templateId mismatch', () => {
    expect(() => buildInitialBattleParticipants(state(), [fieldPlacement('bob', 'p1', 0, 0)]))
      .toThrow(/placement record says/);
  });

  it('throws on duplicate placement records for the same unit', () => {
    expect(() => buildInitialBattleParticipants(state(), [
      fieldPlacement('alice', 'p1', 0, 0),
      fieldPlacement('alice', 'p1', 0, 0),
    ])).toThrow(/duplicate placement record/);
  });
});

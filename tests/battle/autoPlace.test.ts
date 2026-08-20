import { describe, it, expect, beforeEach } from 'vitest';
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  replayPlaceEnemies,
} from '../../src/battle/autoPlace';
import type {
  PlayerPlacementCandidate,
  EnemyPlacementCandidate,
  EnemyReplayPlacementInput,
} from '../../src/battle/autoPlace';
import type { CreateUnitInstanceInput } from '../../src/battle/unitFactory';
import type { UnitBlueprint, UnitLifeState } from '../../src/shared/unitTypes';
import { ucid }                          from '../../src/shared/unitTypes';
import { makeUnit, resetUnitIdCounter }  from './helpers/units';
import { makeBattleStateFromUnits }      from './helpers/battleState';
import { coord }                         from './helpers/coords';
import { fixedRng }                      from './helpers/rng';

const emptyState = () => makeBattleStateFromUnits({}, { benchSlotCount: 3 });

function playerCandidate(
  templateId: string,
  initialLifeState: UnitLifeState = 'alive',
): PlayerPlacementCandidate {
  return {
    templateId,
    shape:       { offsets: [{ dr: 0, dc: 0 }] },
    rowTrait:    'front',
    savedAnchor: null,
    initialLifeState,
    createUnit:  (id) => makeUnit({
      id, templateId, side: 'player',
      ...(initialLifeState === 'dead' ? { lifeState: 'dead' as const, hp: 0 } : {}),
    }),
  };
}

function enemyCandidate(templateId: string): EnemyPlacementCandidate {
  return {
    templateId,
    shape:      { offsets: [{ dr: 0, dc: 0 }] },
    rowTrait:   'front',
    createUnit: (id) => makeUnit({ id, templateId, side: 'enemy' }),
  };
}

function makeReplayBlueprint(templateId: string): UnitBlueprint {
  return {
    templateId,
    name:             templateId,
    hp:               30,
    physicalStrength: 10,
    magicalStrength:  0,
    physicalDefense:  0,
    magicalDefense:   0,
    dodge:            0,
    block:            0,
    level:            1,
    initiative:       10,
    shape:            { offsets: [{ dr: 0, dc: 0 }] },
    rowTrait:         'front',
    baseClassId:      ucid('warrior'),
  };
}

function makeReplayUnitInput(id: string): CreateUnitInstanceInput {
  return {
    blueprint:            makeReplayBlueprint(id),
    id,
    side:                 'enemy',
    level:                1,
    classId:              ucid('warrior'),
    stats:                {
      hp:               30,
      physicalStrength: 10,
      magicalStrength:  0,
      physicalDefense:  0,
      magicalDefense:   0,
      dodge:            0,
      block:            0,
      initiative:       10,
    },
    skills:               [],
    spriteSheet:          undefined,
  };
}

describe('autoPlacePlayer', () => {
  beforeEach(() => resetUnitIdCounter());

  // Contract: one more than field capacity overflows to bench.
  // With the current 2×3 player grid, field capacity is 6; adjust if the grid changes.
  it('places candidates on the field until capacity, then benches overflow', () => {
    const candidates = Array.from({ length: 7 }, (_, i) => playerCandidate(`tpl-${i}`));
    const { state }  = autoPlacePlayer(emptyState(), candidates, 3);

    const deployments = [...state.deployments.values()];
    expect(deployments.filter(d => d.kind === 'field')).toHaveLength(6);
    expect(deployments.filter(d => d.kind === 'bench')).toHaveLength(1);

    const benchUnitId = [...state.deployments.entries()]
      .find(([, d]) => d.kind === 'bench')![0];
    expect(state.occupancy.unitToCells.has(benchUnitId)).toBe(false);
    for (const [id, dep] of state.deployments) {
      if (dep.kind === 'field') expect(state.occupancy.unitToCells.has(id)).toBe(true);
    }
  });

  it('creates each overflow runtime unit exactly once', () => {
    const overflowTpl = 'overflow-tpl';
    const candidates  = [
      ...Array.from({ length: 6 }, (_, i) => playerCandidate(`tpl-${i}`)),
      playerCandidate(overflowTpl),
    ];
    const { state } = autoPlacePlayer(emptyState(), candidates, 3);

    const overflowUnits = [...state.units.values()].filter(u => u.templateId === overflowTpl);
    expect(overflowUnits).toHaveLength(1);

    const dep = state.deployments.get(overflowUnits[0].id);
    expect(dep?.kind).toBe('bench');
  });

  it('every candidate receives a deployment', () => {
    const candidates = Array.from({ length: 9 }, (_, i) => playerCandidate(`tpl-${i}`));
    const { state, placements } = autoPlacePlayer(emptyState(), candidates, 3);

    expect(placements).toHaveLength(9);
    expect(state.units.size).toBe(9);
    expect(state.deployments.size).toBe(9);
  });

  it('throws when a candidate cannot be placed at all', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => playerCandidate(`tpl-${i}`));
    expect(() => autoPlacePlayer(emptyState(), candidates, 3)).toThrow(/no field or bench slot/);
  });
});

describe('autoPlacePlayer — living-first ordering', () => {
  beforeEach(() => resetUnitIdCounter());

  it('creates living candidates before dead ones', () => {
    const candidates = [
      playerCandidate('dead-1', 'dead'),
      playerCandidate('alive-1'),
    ];
    const { state } = autoPlacePlayer(emptyState(), candidates, 3);

    // Runtime IDs follow creation order, which is living-first.
    expect(state.units.get('p1')!.templateId).toBe('alive-1');
    expect(state.units.get('p2')!.templateId).toBe('dead-1');
  });

  it('living units claim the field before corpses compete for it', () => {
    // 3 dead listed first, then 6 living: all 6 living must hold the field.
    const candidates = [
      ...Array.from({ length: 3 }, (_, i) => playerCandidate(`dead-${i}`, 'dead')),
      ...Array.from({ length: 6 }, (_, i) => playerCandidate(`alive-${i}`)),
    ];
    const { state, placements } = autoPlacePlayer(emptyState(), candidates, 3);

    for (const p of placements) {
      const kind = p.templateId.startsWith('alive') ? 'field' : 'bench';
      expect(state.deployments.get(p.unitId)!.kind).toBe(kind);
    }
  });

  it('placement records preserve the original candidate order, not creation order', () => {
    const candidates = [
      playerCandidate('dead-1', 'dead'),
      playerCandidate('alive-1'),
      playerCandidate('dead-2', 'dead'),
      playerCandidate('alive-2'),
    ];
    const { placements } = autoPlacePlayer(emptyState(), candidates, 3);

    expect(placements.map(p => p.templateId)).toEqual(['dead-1', 'alive-1', 'dead-2', 'alive-2']);
  });

  it('records carry the created unit id and its initial deployment', () => {
    const candidates = [playerCandidate('alive-1'), playerCandidate('dead-1', 'dead')];
    const { state, placements } = autoPlacePlayer(emptyState(), candidates, 3);

    for (const p of placements) {
      const unit = state.units.get(p.unitId)!;
      expect(unit.templateId).toBe(p.templateId);
      expect(p.deployment).toEqual(state.deployments.get(p.unitId));
    }
  });

  it('a dead candidate becomes a dead runtime unit outside living occupancy', () => {
    const candidates = [playerCandidate('alive-1'), playerCandidate('dead-1', 'dead')];
    const { state, placements } = autoPlacePlayer(emptyState(), candidates, 3);

    const deadId = placements.find(p => p.templateId === 'dead-1')!.unitId;
    expect(state.units.get(deadId)!.lifeState).toBe('dead');
    expect(state.deployments.get(deadId)!.kind).toBe('field');
    expect(state.occupancy.unitToCells.has(deadId)).toBe(false);
  });
});

describe('autoPlaceEnemies', () => {
  beforeEach(() => resetUnitIdCounter());

  it('creates enemy field deployments with occupancy', () => {
    const result = autoPlaceEnemies(
      emptyState(),
      {
        frontPool: [enemyCandidate('e-front-1'), enemyCandidate('e-front-2')],
        backPool:  [enemyCandidate('e-back-1')],
      },
      fixedRng(0),
    );

    const enemyEntries = [...result.deployments.entries()]
      .filter(([id]) => result.units.get(id)!.side === 'enemy');

    // 3 enemy field cells filled (front row x3 + back row x3, but pools loop and rng picks).
    // We only assert that all enemy deployments are field-kind with occupancy.
    expect(enemyEntries.length).toBeGreaterThan(0);
    for (const [, dep] of enemyEntries) expect(dep.kind).toBe('field');
    for (const [id] of enemyEntries) expect(result.occupancy.unitToCells.has(id)).toBe(true);
  });
});

describe('replayPlaceEnemies', () => {
  beforeEach(() => resetUnitIdCounter());

  it('restores replayed enemy ids and anchors', () => {
    const inputs: EnemyReplayPlacementInput[] = [
      { unitInput: makeReplayUnitInput('rep-A'), anchor: coord('enemy', 0, 0) },
      { unitInput: makeReplayUnitInput('rep-B'), anchor: coord('enemy', 1, 2) },
    ];
    const result = replayPlaceEnemies(emptyState(), inputs);

    for (const { unitInput, anchor } of inputs) {
      expect(result.units.has(unitInput.id)).toBe(true);
      const dep = result.deployments.get(unitInput.id)!;
      expect(dep.kind).toBe('field');
      if (dep.kind === 'field') expect(dep.anchor).toEqual(anchor);
    }
  });
});

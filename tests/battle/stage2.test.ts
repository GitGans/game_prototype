/**
 * Stage 2 tests: Unified Runtime Units for Field and Bench.
 *
 * Verifies that:
 * - Unit has `side` and no `anchor`
 * - createUnitInstance produces Unit with side, no anchor
 * - autoPlacePlayer creates real Units for both field and bench candidates
 * - bench players have bench deployments, field players have field deployments
 * - autoPlaceEnemies creates enemy field deployments
 * - replayPlaceEnemies creates enemy field deployments from replay anchors
 * - placeBenchUnitOnField moves existing bench unit without duplication
 * - swapBenchWithField swaps deployments without changing state.units size
 * - moveFieldUnitToBench keeps unit in state.units
 * - checkGameOver uses field units only (bench units do not keep a side alive)
 * - buildRoundQueue never includes bench units
 * - every unit in state.units has exactly one deployment after battle init
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createUnitInstance, type CreateUnitInstanceInput } from '../../src/battle/unitFactory';
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  replayPlaceEnemies,
  type PlayerPlacementCandidate,
  type EnemyPlacementCandidate,
  type EnemyPlacementCandidates,
  type EnemyReplayPlacementInput,
} from '../../src/battle/autoPlace';
import {
  placeBenchUnitOnField,
  swapBenchWithField,
  moveFieldUnitToBench,
  returnFieldUnitToBench,
} from '../../src/battle/placementState';
import { addFieldUnit, addBenchUnit } from '../../src/battle/placement';
import { isFieldUnit, isBenchUnit, getFieldUnits } from '../../src/battle/deployment';
import { checkGameOver } from '../../src/battle/combat';
import { buildRoundQueue } from '../../src/battle/initiative';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { coord } from './helpers/coords';
import { assertDeploymentInvariants } from './helpers/deploymentInvariants';
import { fixedRng } from './helpers/rng';
import type { BattleState } from '../../src/battle/types';
import type { UnitBlueprint } from '../../src/shared/unitTypes';
import { ucid } from '../../src/shared/unitTypes';
import { buildOccupancy } from '../../src/battle/occupancy';
import { getFieldUnitEntries } from '../../src/battle/deployment';

beforeEach(() => resetUnitIdCounter());

// ─── Minimal blueprint for factory tests ─────────────────────────────────────

function makeBlueprint(id: string): UnitBlueprint {
  return {
    templateId:  id,
    name:        id,
    level:       1,
    hp:          100,
    physicalStrength: 10,
    magicalStrength:  0,
    physicalDefense:  0,
    magicalDefense:   0,
    dodge:       0,
    block:       0,
    initiative:  10,
    shape:       { offsets: [{ dr: 0, dc: 0 }] },
    rowTrait:    'front',
    baseClassId: ucid('warrior'),
  };
}

function makeInput(side: 'player' | 'enemy', id: string): CreateUnitInstanceInput {
  return {
    blueprint:            makeBlueprint(id),
    id,
    side,
    level:                1,
    classId:              ucid('warrior'),
    stats:                { hp: 100, physicalStrength: 10, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0, dodge: 0, block: 0, initiative: 10 },
    skills:               [],
    spriteSheet:          undefined,
    activatableAbilities: [],
  };
}

function emptyState(benchSlotCount = 0): BattleState {
  return { ...makeBattleStateFromUnits({}), benchSlotCount };
}

// ─── createUnitInstance ───────────────────────────────────────────────────────

describe('createUnitInstance — Stage 2', () => {
  it('produces a Unit with side and no anchor', () => {
    const unit = createUnitInstance(makeInput('enemy', 'e1'));
    expect(unit.side).toBe('enemy');
    expect('anchor' in unit).toBe(false);
  });

  it('sets side correctly for player units', () => {
    const unit = createUnitInstance(makeInput('player', 'p1'));
    expect(unit.side).toBe('player');
  });
});

// ─── autoPlacePlayer ─────────────────────────────────────────────────────────

describe('autoPlacePlayer — Stage 2', () => {
  function makeCandidate(id: string): PlayerPlacementCandidate {
    return {
      templateId:  id,
      shape:       { offsets: [{ dr: 0, dc: 0 }] },
      rowTrait:    'front',
      savedAnchor: null,
      createUnit:  (unitId) => makeUnit({ id: unitId, side: 'player', templateId: id }),
    };
  }

  it('field candidates produce real Units with field deployments', () => {
    const c1 = makeCandidate('tpl-a');
    const c2 = makeCandidate('tpl-b');
    const result = autoPlacePlayer(emptyState(3), [c1, c2], 3);

    // Both units are in state.units
    expect(result.units.size).toBe(2);
    // Both have field deployments
    for (const [id] of result.units) {
      expect(isFieldUnit(result, id)).toBe(true);
    }
    assertDeploymentInvariants(result);
  });

  it('overflow candidates become bench units with bench deployments', () => {
    // Fill all 6 field cells with 1×1 units before adding overflow
    const fieldCandidates = Array.from({ length: 6 }, (_, i) => makeCandidate(`field-${i}`));
    const overflowCandidate = makeCandidate('overflow');
    const result = autoPlacePlayer(emptyState(3), [...fieldCandidates, overflowCandidate], 3);

    // overflow is in state.units
    expect(result.units.size).toBe(7);

    // Exactly one bench deployment
    const benchDeployments = [...result.deployments.values()].filter(d => d.kind === 'bench');
    expect(benchDeployments).toHaveLength(1);

    assertDeploymentInvariants(result);
  });

  it('populates benchUnits compatibility mirror for bench candidates', () => {
    const fieldCandidates = Array.from({ length: 6 }, (_, i) => makeCandidate(`field-${i}`));
    const overflowCandidate = makeCandidate('overflow');
    const result = autoPlacePlayer(emptyState(3), [...fieldCandidates, overflowCandidate], 3);

    // Mirror has the overflow unit's templateId
    const mirrorEntry = result.benchUnits.find(b => b?.templateId === 'overflow');
    expect(mirrorEntry).toBeDefined();
  });

  it('bench candidate is created exactly once (no duplicate units)', () => {
    const fieldCandidates = Array.from({ length: 6 }, (_, i) => makeCandidate(`field-${i}`));
    const overflow = makeCandidate('overflow');
    const result   = autoPlacePlayer(emptyState(3), [...fieldCandidates, overflow], 3);

    // 6 field + 1 bench = 7 unique units
    expect(result.units.size).toBe(7);
    // All deployments point to existing units
    for (const [unitId] of result.deployments) {
      expect(result.units.has(unitId)).toBe(true);
    }
  });

  it('all placed units receive sequential pN ids', () => {
    const fieldCandidates = Array.from({ length: 6 }, (_, i) => makeCandidate(`field-${i}`));
    const overflow = makeCandidate('overflow');
    const result   = autoPlacePlayer(emptyState(3), [...fieldCandidates, overflow], 3);

    // All units should have pN ids
    for (const id of result.units.keys()) {
      expect(id).toMatch(/^p\d+$/);
    }
    // IDs are unique
    const ids = [...result.units.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets benchSlotCount on returned state', () => {
    const result = autoPlacePlayer(emptyState(), [makeCandidate('a')], 5);
    expect(result.benchSlotCount).toBe(5);
  });
});

// ─── autoPlaceEnemies ─────────────────────────────────────────────────────────

describe('autoPlaceEnemies — Stage 2', () => {
  function makeEnemyCandidate(id: string): EnemyPlacementCandidate {
    return {
      templateId: id,
      shape:      { offsets: [{ dr: 0, dc: 0 }] },
      rowTrait:   'front',
      createUnit: (unitId) => makeUnit({ id: unitId, side: 'enemy', templateId: id }),
    };
  }

  it('all placed enemies have field deployments', () => {
    const candidates: EnemyPlacementCandidates = {
      frontPool: [makeEnemyCandidate('goblin')],
      backPool:  [],
    };
    const result = autoPlaceEnemies(emptyState(), candidates, fixedRng(0));

    for (const [id] of result.units) {
      expect(isFieldUnit(result, id)).toBe(true);
      expect(result.units.get(id)!.side).toBe('enemy');
    }
    assertDeploymentInvariants(result);
  });

  it('enemies have no anchor on Unit', () => {
    const candidates: EnemyPlacementCandidates = {
      frontPool: [makeEnemyCandidate('goblin')],
      backPool:  [],
    };
    const result = autoPlaceEnemies(emptyState(), candidates, fixedRng(0));
    for (const unit of result.units.values()) {
      expect('anchor' in unit).toBe(false);
    }
  });
});

// ─── replayPlaceEnemies ───────────────────────────────────────────────────────

describe('replayPlaceEnemies — Stage 2', () => {
  it('places enemies at saved anchors with field deployments', () => {
    const anchor1 = coord('enemy', 0, 0);
    const anchor2 = coord('enemy', 0, 1);

    const inputs: EnemyReplayPlacementInput[] = [
      { unitInput: makeInput('enemy', 'e1'), anchor: anchor1 },
      { unitInput: makeInput('enemy', 'e2'), anchor: anchor2 },
    ];

    const result = replayPlaceEnemies(emptyState(), inputs);

    expect(result.units.size).toBe(2);
    // Deployments match the saved anchors
    const d1 = result.deployments.get('e1');
    const d2 = result.deployments.get('e2');
    expect(d1?.kind).toBe('field');
    expect(d2?.kind).toBe('field');
    if (d1?.kind === 'field') expect(d1.anchor).toEqual(anchor1);
    if (d2?.kind === 'field') expect(d2.anchor).toEqual(anchor2);

    assertDeploymentInvariants(result);
  });
});

// ─── placeBenchUnitOnField ────────────────────────────────────────────────────

describe('placeBenchUnitOnField — Stage 2', () => {
  it('moves an existing bench unit to field without creating a duplicate', () => {
    const benchUnit = makeUnit({ side: 'player' });
    let state = emptyState(3);
    state = addBenchUnit(state, benchUnit, 0);
    state = { ...state, benchUnits: [{ templateId: benchUnit.templateId }] };

    const anchor    = coord('player', 0, 0);
    const nextState = placeBenchUnitOnField(state, benchUnit, anchor, 0);

    // No new unit was created — still exactly 1 unit
    expect(nextState.units.size).toBe(1);
    // Deployment changed to field
    expect(isFieldUnit(nextState, benchUnit.id)).toBe(true);
    // Mirror cleared
    expect(nextState.benchUnits[0]).toBeUndefined();
    assertDeploymentInvariants(nextState);
  });

  it('returns unchanged state if unit is not bench-deployed at the slot', () => {
    const unit  = makeUnit({ side: 'player' });
    let state   = emptyState(3);
    state = addFieldUnit(state, unit, coord('player', 0, 0));

    // Trying to place a field unit "as if" it were bench — should no-op
    const nextState = placeBenchUnitOnField(state, unit, coord('player', 0, 1), 0);
    expect(nextState).toBe(state); // reference equality = unchanged
  });
});

// ─── swapBenchWithField ───────────────────────────────────────────────────────

describe('swapBenchWithField — Stage 2', () => {
  it('swaps deployments without changing state.units size', () => {
    const fieldUnit = makeUnit({ side: 'player' });
    const benchUnit = makeUnit({ side: 'player' });
    let state = emptyState(3);
    state = addFieldUnit(state, fieldUnit, coord('player', 0, 0));
    state = addBenchUnit(state, benchUnit, 0);
    state = { ...state, benchUnits: [{ templateId: benchUnit.templateId }, undefined, undefined] };

    const next = swapBenchWithField(state, benchUnit, 0, fieldUnit);

    expect(next.units.size).toBe(2); // no new units
    expect(isFieldUnit(next, benchUnit.id)).toBe(true);
    expect(isBenchUnit(next, fieldUnit.id)).toBe(true);
    // Mirror updated
    expect(next.benchUnits[0]?.templateId).toBe(fieldUnit.templateId);
    assertDeploymentInvariants(next);
  });
});

// ─── moveFieldUnitToBench ─────────────────────────────────────────────────────

describe('moveFieldUnitToBench — Stage 2', () => {
  it('keeps unit in state.units after moving to bench', () => {
    const unit  = makeUnit({ side: 'player' });
    let state   = emptyState(3);
    state = addFieldUnit(state, unit, coord('player', 0, 0));

    const next = moveFieldUnitToBench(state, unit.id, 0);

    expect(next.units.size).toBe(1); // unit still present
    expect(isBenchUnit(next, unit.id)).toBe(true);
    expect(next.benchUnits[0]?.templateId).toBe(unit.templateId);
    assertDeploymentInvariants(next);
  });
});

// ─── returnFieldUnitToBench ───────────────────────────────────────────────────

describe('returnFieldUnitToBench — Stage 2', () => {
  it('returns field unit to first free bench slot', () => {
    const unit  = makeUnit({ side: 'player' });
    let state   = emptyState(3);
    state = addFieldUnit(state, unit, coord('player', 0, 0));

    const next = returnFieldUnitToBench(state, unit.id);

    expect(next.units.size).toBe(1);
    expect(isBenchUnit(next, unit.id)).toBe(true);
    assertDeploymentInvariants(next);
  });
});

// ─── checkGameOver — field-only ────────────────────────────────────────────

describe('checkGameOver — Stage 2 (field units only)', () => {
  it('returns null when both sides have field units alive', () => {
    const player = makeUnit({ side: 'player' });
    const enemy  = makeUnit({ side: 'enemy' });
    const state  = makeBattleStateFromUnits({
      field: [
        { unit: player, anchor: coord('player', 0, 0) },
        { unit: enemy,  anchor: coord('enemy',  0, 0) },
      ],
    });
    expect(checkGameOver(state)).toBeNull();
  });

  it('returns "player" (enemy wins) when all player field units are dead but a bench player exists', () => {
    // Player field unit is dead (hp = 0), bench player is alive (hp = 100)
    const deadPlayer  = makeUnit({ side: 'player', hp: 0 });
    const benchPlayer = makeUnit({ side: 'player', hp: 100 });
    const enemy       = makeUnit({ side: 'enemy' });

    let state = makeBattleStateFromUnits({
      field: [
        { unit: deadPlayer, anchor: coord('player', 0, 0) },
        { unit: enemy,      anchor: coord('enemy',  0, 0) },
      ],
      bench: [{ unit: benchPlayer, slot: 0 }],
      benchSlotCount: 1,
    });

    // Remove dead player from field (combat would do this)
    const newUnits       = new Map(state.units);
    const newDeployments = new Map(state.deployments);
    newUnits.delete(deadPlayer.id);
    newDeployments.delete(deadPlayer.id);
    state = { ...state, units: newUnits, deployments: newDeployments, occupancy: buildOccupancy(newUnits, newDeployments) };

    // Bench player is still alive in state.units, but checkGameOver should not count bench units
    expect(checkGameOver(state)).toBe('player'); // enemy wins; bench player doesn't prevent loss
  });

  it('returns "enemy" when all enemy field units are removed', () => {
    const player = makeUnit({ side: 'player' });
    const state  = makeBattleStateFromUnits({
      field: [{ unit: player, anchor: coord('player', 0, 0) }],
    });
    expect(checkGameOver(state)).toBe('enemy');
  });
});

// ─── buildRoundQueue — field-only ─────────────────────────────────────────────

describe('buildRoundQueue — Stage 2 (field units only)', () => {
  it('bench units do not appear in the round queue', () => {
    const fieldUnit = makeUnit({ side: 'player' });
    const benchUnit = makeUnit({ side: 'player' });
    let state = emptyState(3);
    state = addFieldUnit(state, fieldUnit, coord('player', 0, 0));
    state = addBenchUnit(state, benchUnit, 0);

    // buildRoundQueue is called with field units only — use getFieldUnitEntries
    const queue = buildRoundQueue(new Map(getFieldUnitEntries(state)));

    expect(queue).toContain(fieldUnit.id);
    expect(queue).not.toContain(benchUnit.id);
  });
});

// ─── Deployment invariants after auto-placement ───────────────────────────────

describe('deployment invariants — Stage 2', () => {
  it('every unit in state.units has exactly one deployment', () => {
    const fieldCandidates = Array.from({ length: 4 }, (_, i) => ({
      templateId:  `unit-${i}`,
      shape:       { offsets: [{ dr: 0, dc: 0 }] } as const,
      rowTrait:    'front' as const,
      savedAnchor: null,
      createUnit:  (id: string) => makeUnit({ id, side: 'player' as const }),
    }));
    // 5th candidate overflows to bench
    const overflow = {
      templateId:  'overflow',
      shape:       { offsets: [{ dr: 0, dc: 0 }] } as const,
      rowTrait:    'front' as const,
      savedAnchor: null,
      createUnit:  (id: string) => makeUnit({ id, side: 'player' as const }),
    };
    const state = autoPlacePlayer(emptyState(3), [...fieldCandidates, overflow], 3);

    // Every unit → exactly one deployment
    for (const [id] of state.units) {
      const d = state.deployments.get(id);
      expect(d).toBeDefined();
    }
    // Every deployment → existing unit
    for (const [id] of state.deployments) {
      expect(state.units.has(id)).toBe(true);
    }

    assertDeploymentInvariants(state);
  });
});

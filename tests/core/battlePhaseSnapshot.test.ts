import { beforeEach, describe, expect, it } from 'vitest';
import { buildBattlePhaseSnapshot } from '../../src/core/battlePhaseSnapshot';
import {
  createBattleRuntimeContext,
  type BattleParticipant,
  type BattleRuntimeContext,
} from '../../src/core/battleRuntimeContext';
import type { BattleState, Unit } from '../../src/battle/types';
import type { CellCoord } from '../../src/shared/gridTypes';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import {
  testStrike,
  testMagicBolt,
  testHeal,
  testRevive,
} from '../battle/helpers/skills';
import { makeBattlePhase, makeWorldMapPhase } from './helpers/phaseFixtures';

const PLAYER_ANCHOR: CellCoord = { side: 'player', row: 0, col: 0 };
const ENEMY_ANCHOR: CellCoord = { side: 'enemy', row: 0, col: 0 };

function participant(overrides: Partial<BattleParticipant> = {}): BattleParticipant {
  return {
    templateId: 'test',
    name: 'Test Unit',
    level: 1,
    isAlive: true,
    wasOnBench: false,
    spriteKey: null,
    ...overrides,
  };
}

function makeRuntime(
  state: BattleState,
  overrides: Partial<BattleRuntimeContext> = {},
): BattleRuntimeContext {
  return {
    ...createBattleRuntimeContext({
      state,
      participants: [participant()],
      replaySetup: { enemyPlacements: [] },
      sessionSource: 'campaign',
    }),
    ...overrides,
  };
}

/** One living player unit on the field, one enemy — the default projection fixture. */
function defaultState(playerOverrides: Partial<Unit> = {}): BattleState {
  return makeBattleStateFromUnits({
    field: [
      { unit: makeUnit({ id: 'p1', side: 'player', ...playerOverrides }), anchor: PLAYER_ANCHOR },
      { unit: makeUnit({ id: 'e1', side: 'enemy' }), anchor: ENEMY_ANCHOR },
    ],
  });
}

describe('buildBattlePhaseSnapshot', () => {
  beforeEach(() => resetUnitIdCounter());

  describe('control fields', () => {
    it('projects mode, active side and the manual control flags', () => {
      const state = defaultState();
      const runtime = makeRuntime(state, { mode: 'manual' });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.battleMode).toBe('manual');
      expect(result.activeUnitId).toBe('p1');
      expect(result.activeUnitSide).toBe('player');
      expect(result.manualTurnControlsVisible).toBe(true);
      expect(result.manualChargeDisabled).toBe(false);
      expect(result.battlePhase).toBe('select_target');
    });

    it('hides manual controls in auto mode', () => {
      const runtime = makeRuntime(defaultState(), { mode: 'auto' });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.manualTurnControlsVisible).toBe(false);
    });

    it('hides manual controls when the active unit is an enemy', () => {
      const state = makeBattleStateFromUnits({
        field: [{ unit: makeUnit({ id: 'e1', side: 'enemy' }), anchor: ENEMY_ANCHOR }],
      });
      const runtime = makeRuntime(state, { mode: 'manual' });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.activeUnitSide).toBe('enemy');
      expect(result.manualTurnControlsVisible).toBe(false);
    });

    it('disables charge for a unit that already charged this round', () => {
      const runtime = makeRuntime(defaultState(), {
        turnContext: { chargedThisRound: new Set(['p1']) },
      });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.manualChargeDisabled).toBe(true);
    });

    it('forwards canBeginCombat from the battle domain', () => {
      const placement = makeBattleStateFromUnits(
        { field: [{ unit: makeUnit({ id: 'p1', side: 'player' }), anchor: PLAYER_ANCHOR }] },
        { phase: 'placement', roundQueue: [] },
      );

      expect(buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(placement)).canBeginCombat)
        .toBe(true);

      const emptyField = makeBattleStateFromUnits({}, { phase: 'placement' });
      expect(buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(emptyField)).canBeginCombat)
        .toBe(false);
    });
  });

  describe('active unit resolution', () => {
    it('resolves the active unit through fieldUnits, not unitsById', () => {
      // A bench unit at the head of the queue can never be the active unit: the queue is
      // field-only by invariant, and activeUnit is typed FieldBattleUnitSnapshot.
      const state = makeBattleStateFromUnits(
        {
          field: [{ unit: makeUnit({ id: 'p1', side: 'player' }), anchor: PLAYER_ANCHOR }],
          bench: [{ unit: makeUnit({ id: 'b1', side: 'player' }), slot: 0 }],
          benchSlotCount: 1,
        },
        { roundQueue: ['b1'] },
      );

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.activeUnitId).toBe('b1');
      expect(result.unitsById.has('b1')).toBe(true);
      expect(result.activeUnit).toBeNull();
      expect(result.activeUnitSide).toBeNull();
    });

    it('is null when the round queue is empty', () => {
      const state = makeBattleStateFromUnits({}, { roundQueue: [] });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.activeUnitId).toBeNull();
      expect(result.activeUnit).toBeNull();
    });

    it('shares one canonical snapshot instance across unitsById, fieldUnits and activeUnit', () => {
      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(defaultState()));

      const fromMap = result.unitsById.get('p1');
      const fromField = result.fieldUnits.find(u => u.id === 'p1');

      expect(fromMap).toBe(fromField);
      expect(result.activeUnit).toBe(fromField);
    });
  });

  describe('value isolation', () => {
    it('copies participants, queue, valid targets and placement selection', () => {
      const targets: CellCoord[] = [{ side: 'enemy', row: 0, col: 0 }];
      const state = makeBattleStateFromUnits(
        { field: [{ unit: makeUnit({ id: 'p1', side: 'player' }), anchor: PLAYER_ANCHOR }] },
        {
          validTargets: targets,
          placementSelection: { selectedBenchUnitId: 'b1', selectedFieldUnitId: null },
        },
      );
      const runtime = makeRuntime(state);

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.participants).not.toBe(runtime.participants);
      expect(result.participants[0]).not.toBe(runtime.participants[0]);
      expect(result.roundQueue).not.toBe(state.roundQueue);
      expect(result.validTargets).not.toBe(state.validTargets);
      expect(result.validTargets[0]).not.toBe(targets[0]);
      expect(result.placementSelection).not.toBe(state.placementSelection);
    });

    it('cannot write back into the runtime through the returned snapshot', () => {
      const state = makeBattleStateFromUnits(
        { field: [{ unit: makeUnit({ id: 'p1', side: 'player' }), anchor: PLAYER_ANCHOR }] },
        {
          validTargets: [{ side: 'enemy', row: 0, col: 0 }],
          placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
        },
      );
      const runtime = makeRuntime(state);

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      result.placementSelection.selectedBenchUnitId = 'hacked';
      result.roundQueue.push('hacked');
      result.validTargets[0].row = 1;
      result.participants[0].name = 'hacked';

      expect(state.placementSelection).toEqual({
        selectedBenchUnitId: null,
        selectedFieldUnitId: null,
      });
      expect(state.roundQueue).toEqual(['p1']);
      expect(state.validTargets).toEqual([{ side: 'enemy', row: 0, col: 0 }]);
      expect(runtime.participants[0].name).toBe('Test Unit');
    });

    it('keeps participants as the battle-start snapshot, not current placement', () => {
      const state = defaultState();
      const runtime = makeRuntime(state, {
        participants: [participant({ templateId: 'p1', wasOnBench: true })],
      });

      // Move the unit to the bench AFTER the runtime was built.
      state.deployments.set('p1', { kind: 'bench', slot: 0 });
      state.benchSlotCount = 1;

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), runtime);

      expect(result.participants).toEqual([participant({ templateId: 'p1', wasOnBench: true })]);
    });
  });

  describe('target highlight routing', () => {
    const targets: CellCoord[] = [{ side: 'enemy', row: 0, col: 0 }];

    function highlightFor(skill: Unit['skills'][number], validTargets = targets) {
      const state = makeBattleStateFromUnits(
        { field: [{ unit: makeUnit({ id: 'p1', side: 'player', skills: [skill] }), anchor: PLAYER_ANCHOR }] },
        { validTargets },
      );
      return buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state)).targetHighlightKind;
    }

    it('maps enemy policies to "target"', () => {
      expect(highlightFor(testStrike)).toBe('target');
      expect(highlightFor(testMagicBolt)).toBe('target');
    });

    it('maps alive-friendly policies to "heal_target"', () => {
      expect(highlightFor(testHeal)).toBe('heal_target');
    });

    it('maps dead-friendly policies to "revive_target"', () => {
      expect(highlightFor(testRevive)).toBe('revive_target');
    });

    it('is "none" without valid targets', () => {
      expect(highlightFor(testStrike, [])).toBe('none');
    });

    it('is "none" without an active unit', () => {
      const state = makeBattleStateFromUnits({}, { validTargets: targets, roundQueue: [] });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.targetHighlightKind).toBe('none');
    });
  });

  describe('preview target routing', () => {
    function stateWithPreview(
      previewTargetCoord: CellCoord | null,
      overrides: Partial<BattleState> = {},
    ): BattleState {
      const target: CellCoord = { side: 'enemy', row: 0, col: 0 };
      return makeBattleStateFromUnits(
        {
          field: [
            { unit: makeUnit({ id: 'p1', side: 'player' }), anchor: PLAYER_ANCHOR },
            { unit: makeUnit({ id: 'e1', side: 'enemy' }), anchor: ENEMY_ANCHOR },
          ],
        },
        { validTargets: [target], previewTargetCoord, ...overrides },
      );
    }

    it('projects a valid select_target preview', () => {
      const state = stateWithPreview({ side: 'enemy', row: 0, col: 0 });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.previewTargetCoord).toEqual({ side: 'enemy', row: 0, col: 0 });
      expect(result.previewTargetUnitId).toBe('e1');
    });

    it('drops a preview coordinate outside validTargets', () => {
      const state = stateWithPreview({ side: 'enemy', row: 1, col: 2 });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.previewTargetCoord).toBeNull();
      expect(result.previewTargetUnitId).toBeNull();
    });

    it('drops any preview outside the select_target phase', () => {
      const state = stateWithPreview({ side: 'enemy', row: 0, col: 0 }, { phase: 'placement' });

      const result = buildBattlePhaseSnapshot(makeBattlePhase(), makeRuntime(state));

      expect(result.previewTargetCoord).toBeNull();
      expect(result.previewTargetUnitId).toBeNull();
    });
  });

  it('preserves the phase routing fields untouched', () => {
    const returnPhase = makeWorldMapPhase({ mapId: 'test_01' });
    const phase = makeBattlePhase({
      sessionSource: 'debug',
      enemyGroupId: 'orc_patrol',
      returnPhase,
      mapId: 'test_01',
      triggerPos: { x: 2, y: 2 },
    });
    const runtime = makeRuntime(defaultState(), { sessionSource: 'debug' });

    const result = buildBattlePhaseSnapshot(phase, runtime);

    expect(result.type).toBe('battle');
    expect(result.sessionSource).toBe('debug');
    expect(result.enemyGroupId).toBe('orc_patrol');
    expect(result.returnPhase).toBe(returnPhase);
    expect(result.mapId).toBe('test_01');
    expect(result.triggerPos).toEqual({ x: 2, y: 2 });
  });
});

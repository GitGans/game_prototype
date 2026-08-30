import { describe, it, expect, afterEach } from 'vitest';
import { GameState } from '../../src/core/GameState';
import {
  startBattleRuntime,
  replayBattleRuntime,
  applyBattleExitRosterEffect,
  applyBattleRuntimeMutation,
  clearBattleRuntimeIfPresent,
  teardownBattleRuntimeAfterTransition,
} from '../../src/core/battlePhaseEffects';
import { MathRng, ScriptedRng } from '../../src/core/random';
import { makeBattlePhase, makeWorldMapPhase } from './helpers/phaseFixtures';
import {
  createLifecycleHarness,
  resetGameStateBetweenTests,
  requireInstalledRuntime,
  hasInstalledRuntime,
  projectEnemyPlacements,
  ORC_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_TRIGGER_POS,
} from './helpers/phaseManagerLifecycleHarness';

/**
 * The battle runtime read/write seam, exercised directly rather than through
 * `PhaseManager.transition()`.
 *
 * What is only observable here: that each operation validates `sessionSource` INSIDE its own
 * body (no operation may rely on a caller having validated first), that replay consumes no
 * randomness, that only narrowed feedback escapes, and that generic teardown is keyed on phase
 * types rather than action names.
 *
 * Combat rules stay owned by `battlePhaseHandler.test.ts`; the orchestration contract stays
 * owned by `phaseManagerBattleLifecycle.characterization.test.ts`.
 */

/** Establishes a campaign with a live battle runtime, then returns its committed battle phase. */
function liveCampaignBattle() {
  const harness = createLifecycleHarness();
  harness.startNewCampaign();
  harness.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
  const phase = harness.manager.getPhase();
  if (phase.type !== 'battle') throw new Error(`expected a battle phase, got ${phase.type}`);
  return { harness, phase };
}

/** An Rng that fails the test if anything draws from it. */
const forbiddenRng = new ScriptedRng([]);

afterEach(resetGameStateBetweenTests);

describe('startBattleRuntime', () => {
  it('installs one runtime for the session named by the resolved phase', () => {
    const harness = createLifecycleHarness();
    harness.startNewCampaign();
    const resolvedPhase = makeBattlePhase({
      sessionSource: 'campaign',
      enemyGroupId: ORC_PATROL_ENEMY_GROUP_ID,
    });

    startBattleRuntime({
      resolvedPhase,
      battleSetupRng: new MathRng(),
      actionType: 'enter_battle',
    });

    const runtime = requireInstalledRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime!.sessionSource).toBe('campaign');
    expect(runtime!.state.units.size).toBeGreaterThan(0);
  });

  it('draws enemy placement from the supplied setup stream', () => {
    const harness = createLifecycleHarness();
    harness.startNewCampaign();
    const rng = new ScriptedRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);

    startBattleRuntime({
      resolvedPhase: makeBattlePhase({
        sessionSource: 'campaign',
        enemyGroupId: ORC_PATROL_ENEMY_GROUP_ID,
      }),
      battleSetupRng: rng,
      actionType: 'enter_battle',
    });

    // A ScriptedRng throws on exhaustion, so reaching here at all proves the stream was the
    // one consumed; a placement check proves it actually reached enemy setup.
    expect(projectEnemyPlacements(requireInstalledRuntime()).length).toBeGreaterThan(0);
  });

  it('throws a lifecycle error when the action did not resolve to a battle phase', () => {
    expect(() => startBattleRuntime({
      resolvedPhase: makeWorldMapPhase(),
      battleSetupRng: new MathRng(),
      actionType: 'start_battle',
    })).toThrow('must resolve to a battle phase');
  });
});

describe('replayBattleRuntime', () => {
  it('installs an independent runtime that restores the captured enemy formation', () => {
    const { phase } = liveCampaignBattle();
    const before = requireInstalledRuntime();
    const placementsBefore = projectEnemyPlacements(before);

    replayBattleRuntime(phase);

    const after = requireInstalledRuntime();
    expect(after).not.toBe(before);
    expect(after.state).not.toBe(before.state);
    // Enemies are restored, not rerolled — that is what makes replay a retry of the same
    // encounter rather than a new one.
    expect(projectEnemyPlacements(after)).toEqual(placementsBefore);
  });

  it('consumes no randomness', () => {
    // Structural: the function takes no Rng parameter at all, so the only way it could draw is
    // by reaching for a module-level stream. Asserting the placement is identical to the
    // original (above) is the behavioral half of the same contract.
    const { phase } = liveCampaignBattle();
    const before = projectEnemyPlacements(requireInstalledRuntime());

    replayBattleRuntime(phase);
    replayBattleRuntime(phase);

    expect(projectEnemyPlacements(requireInstalledRuntime())).toEqual(before);
  });
});

describe('battle runtime session validation', () => {
  /**
   * Each operation resolves the runtime through `requireBattleRuntimeForPhase()` in its own
   * body. A debug runtime under a campaign phase (or the reverse) must throw — never fall back
   * to the other session's storage.
   */
  it.each([
    ['applyBattleRuntimeMutation', (phase: ReturnType<typeof makeBattlePhase>) =>
      applyBattleRuntimeMutation({
        previousPhase: phase,
        action: { type: 'clear_placement_selection' },
        battleResolutionRng: forbiddenRng,
      })],
    ['replayBattleRuntime', (phase: ReturnType<typeof makeBattlePhase>) =>
      replayBattleRuntime(phase)],
    ['applyBattleExitRosterEffect', (phase: ReturnType<typeof makeBattlePhase>) =>
      applyBattleExitRosterEffect({ previousPhase: phase, outcome: 'victory' })],
  ])('%s throws on a sessionSource mismatch', (_label, operation) => {
    const { phase } = liveCampaignBattle(); // runtime.sessionSource === 'campaign'
    const mismatchedPhase = { ...phase, sessionSource: 'debug' as const };

    expect(() => operation(mismatchedPhase)).toThrow();
  });
});

describe('applyBattleRuntimeMutation', () => {
  it('keeps the runtime installed', () => {
    // A mutation is not an exit: teardown must not be reachable from this path.
    const { phase } = liveCampaignBattle();

    applyBattleRuntimeMutation({
      previousPhase: phase,
      action: { type: 'clear_placement_selection' },
      battleResolutionRng: forbiddenRng,
    });

    expect(hasInstalledRuntime()).toBe(true);
  });

  it('narrows the turn directive, dropping the runtime-aliasing fields', () => {
    const { harness, phase } = liveCampaignBattle();
    harness.manager.transition({ type: 'battle_begin_combat' });

    const result = applyBattleRuntimeMutation({
      previousPhase: phase,
      action: { type: 'battle_start_turn' },
      battleResolutionRng: forbiddenRng,
    });

    const feedback = result.battleFeedback;
    expect(feedback).not.toBeNull();
    expect(feedback!.directive).toBeDefined();
    // The internal `await_manual_target` directive carries `validTargets` — the SAME array
    // installed into BattleState.validTargets — plus an internal `activeSkill`. Neither may
    // cross this seam: forwarding either hands a scene a live handle into committed runtime
    // state, which is why the projection rebuilds the directive field-by-field.
    expect(feedback!.directive).not.toHaveProperty('validTargets');
    expect(feedback!.directive).not.toHaveProperty('activeSkill');
    // Nor may the handler's own authoritative result fields leak through.
    expect(feedback).not.toHaveProperty('state');
    expect(feedback).not.toHaveProperty('context');
  });

  it('narrows the auto-turn intention, dropping its action payload', () => {
    const { harness, phase } = liveCampaignBattle();
    harness.manager.transition({ type: 'battle_begin_combat' });
    harness.manager.transition({ type: 'battle_set_mode', mode: 'auto' });

    const result = applyBattleRuntimeMutation({
      previousPhase: phase,
      action: { type: 'battle_decide_auto_turn' },
      battleResolutionRng: new MathRng(),
    });

    const directive = result.battleFeedback!.autoTurnDirective;
    expect(directive).toBeDefined();
    if (directive?.type === 'intention') {
      // The runtime stores the SAME AutoTurnIntention object it decided on; the public DTO
      // deliberately carries only unitId + activeUnitSide, never the action payload.
      expect(directive.intention).not.toHaveProperty('skillIndex');
      expect(directive.intention).not.toHaveProperty('target');
    }
  });

  it('produces no feedback for a non-turn mutation', () => {
    const { phase } = liveCampaignBattle();

    const result = applyBattleRuntimeMutation({
      previousPhase: phase,
      action: { type: 'battle_set_mode', mode: 'auto' },
      battleResolutionRng: forbiddenRng,
    });

    expect(result.battleFeedback).toBeNull();
  });
});

describe('battle runtime disposal', () => {
  it('clearBattleRuntimeIfPresent is safe with and without an installed runtime', () => {
    liveCampaignBattle();
    clearBattleRuntimeIfPresent();
    expect(hasInstalledRuntime()).toBe(false);

    expect(() => clearBattleRuntimeIfPresent()).not.toThrow();
    expect(hasInstalledRuntime()).toBe(false);
  });

  it('clears the runtime when leaving battle for a non-battle phase', () => {
    const { phase } = liveCampaignBattle();

    teardownBattleRuntimeAfterTransition(phase, makeWorldMapPhase());

    expect(hasInstalledRuntime()).toBe(false);
  });

  it.each([
    ['battle -> battle (replay or mutation)', () => makeBattlePhase(), () => makeBattlePhase()],
    ['non-battle -> non-battle', () => makeWorldMapPhase(), () => makeWorldMapPhase()],
    ['non-battle -> battle (entry)', () => makeWorldMapPhase(), () => makeBattlePhase()],
  ])('keeps the runtime for %s', (_label, previous, resolved) => {
    liveCampaignBattle();

    teardownBattleRuntimeAfterTransition(previous(), resolved());

    expect(hasInstalledRuntime()).toBe(true);
  });

  it('is keyed on phase type, not object identity', () => {
    // `replay` resolves to `{ ...currentPhase }` — a COPY of the battle phase. Comparing
    // identity here would tear down the runtime the replay just installed.
    const { phase } = liveCampaignBattle();

    teardownBattleRuntimeAfterTransition(phase, { ...phase });

    expect(hasInstalledRuntime()).toBe(true);
  });
});

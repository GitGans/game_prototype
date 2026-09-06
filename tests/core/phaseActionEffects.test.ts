import { describe, it, expect, vi } from 'vitest';
import { createPhaseActionEffects } from '../../src/core/phaseActionEffects';
import { NO_PHASE_EFFECTS } from '../../src/core/phaseEffectsResult';
import type { PhaseAction, GamePhase } from '../../src/core/phases';
import { makeBattlePhase, makeEquipScreenPhase, makeWorldMapPhase } from './helpers/phaseFixtures';
import { makeFakeEffectsDependencies } from './helpers/phaseActionEffectsFakes';

/**
 * Structural contract of the effects facade: dispatch coverage, cross-domain ORDERING, RNG
 * stream routing and per-controller RNG isolation.
 *
 * This suite drives the facade through injected fakes, so it proves *which owner runs when* —
 * something a real-GameState test cannot distinguish (roster-then-world and world-then-roster
 * leave the same final state). It deliberately proves nothing about what the owners do.
 * End-to-end behavior stays owned by the Stage 2 characterization suites, which drive the real
 * singleton graph through `PhaseManager.transition()`. Where the two ever disagree, those win.
 */

const MAIN_MENU: GamePhase = { type: 'main_menu' };
const WORLD_MAP = makeWorldMapPhase();
const BATTLE = makeBattlePhase();

function setup(overrides = {}) {
  const fakes = makeFakeEffectsDependencies(overrides);
  const controller = createPhaseActionEffects(fakes.deps);
  // Construction draws the initial pair; drop it so `calls` reads as action effects only.
  fakes.calls.length = 0;
  return { ...fakes, controller };
}

describe('phaseActionEffects dispatch', () => {
  it('performs no mutation for a navigation-only action', () => {
    const { controller, calls } = setup();

    const result = controller.apply({ type: 'enter_camp' }, WORLD_MAP, MAIN_MENU);

    expect(result).toBe(NO_PHASE_EFFECTS);
    expect(calls).toEqual(['teardown']);
  });

  it('returns the battle mutation result by identity', () => {
    const feedback = { battleFeedback: { events: [] } };
    const { controller } = setup({
      applyBattleRuntimeMutation: () => feedback as never,
    });

    const result = controller.apply({ type: 'battle_start_turn' }, BATTLE, BATTLE);

    // The facade must forward the owner's PhaseEffectsResult untouched — no re-wrapping,
    // no copying, no widening.
    expect(result).toBe(feedback);
  });

  it('runs the generic teardown after every successfully handled action', () => {
    const cases: Array<[string, PhaseAction, GamePhase, GamePhase]> = [
      ['navigation', { type: 'exit_camp' }, WORLD_MAP, WORLD_MAP],
      ['session lifecycle', { type: 'exit_to_menu' }, WORLD_MAP, MAIN_MENU],
      ['battle mutation', { type: 'battle_start_turn' }, BATTLE, BATTLE],
      ['battle exit', { type: 'exit_battle', outcome: 'defeat' }, BATTLE, WORLD_MAP],
      ['world', { type: 'move_party', partyPos: { x: 1, y: 1 } }, WORLD_MAP, WORLD_MAP],
    ];

    for (const [label, action, previous, resolved] of cases) {
      const { controller, calls } = setup();
      controller.apply(action, previous, resolved);
      expect(calls.filter((c) => c === 'teardown'), label).toHaveLength(1);
      expect(calls.at(-1), `${label}: teardown must run last`).toBe('teardown');
    }
  });
});

describe('phaseActionEffects lifecycle ordering', () => {
  it('orders new_game as clear debug -> clear runtime -> drop confirmations -> reset RNG -> build campaign', () => {
    const { controller, calls } = setup();

    controller.apply({ type: 'new_game' }, MAIN_MENU, WORLD_MAP);

    // Accepted from ANY phase, so BOTH confirmation owners are disposed explicitly rather than
    // relying on the equip-screen teardown, which only fires when leaving an equip screen.
    expect(calls).toEqual([
      'clearDebug', 'clearRuntime', 'consumeClear', 'consumeClear', 'rng', 'campaign', 'teardown',
    ]);
  });

  it('orders init_debug as clear runtime -> reset RNG -> create session', () => {
    const { controller, calls, deps } = setup();

    controller.apply({ type: 'init_debug', level: 4 }, { type: 'debug_level_select' }, WORLD_MAP);

    expect(calls).toEqual(['clearRuntime', 'consumeClear', 'rng', 'debugInit', 'teardown']);
    expect(deps.initializeDebugSessionForLevel).toHaveBeenCalledWith(4);
  });

  it('orders reset_debug_session as clear runtime -> drop the debug confirmation -> reset RNG -> rebuild session', () => {
    const { controller, calls } = setup();

    controller.apply({ type: 'reset_debug_session' }, WORLD_MAP, WORLD_MAP);

    // The explicit clear is load-bearing: a reset keeps the same phase AND the same selected
    // character, so the structural teardown never fires — and it recreates the same authored
    // instance ids, so matching ids would not distinguish the stale request either.
    expect(calls).toEqual(['clearRuntime', 'consumeClear', 'rng', 'debugReset', 'teardown']);
  });

  it('orders exit_to_menu as clear debug -> clear runtime -> reset RNG', () => {
    const { controller, calls } = setup();

    controller.apply({ type: 'exit_to_menu' }, WORLD_MAP, MAIN_MENU);

    expect(calls).toEqual([
      'clearDebug', 'clearRuntime', 'consumeClear', 'consumeClear', 'rng', 'teardown',
    ]);
  });

  it('persists the roster result before the world consequence and clears the runtime last', () => {
    // The load-bearing order of battle exit: both effects need the runtime still installed,
    // so disposal cannot move ahead of either.
    const { controller, calls } = setup();

    controller.apply({ type: 'exit_battle', outcome: 'victory' }, BATTLE, WORLD_MAP);

    expect(calls).toEqual(['rosterResult', 'worldConsequence', 'teardown']);
  });

  it('does not run the generic teardown when an action-specific effect throws', () => {
    // Non-transactional by contract: the failed mutation is NOT rolled back, but nothing
    // after it runs either — no teardown, and (in the coordinator) no commit or sync.
    const { controller, calls } = setup({
      applyBattleExitRosterEffect: () => {
        calls.push('rosterResult');
        throw new Error('roster write failed');
      },
    });

    expect(() =>
      controller.apply({ type: 'exit_battle', outcome: 'victory' }, BATTLE, WORLD_MAP),
    ).toThrow('roster write failed');

    expect(calls).toEqual(['rosterResult']);
  });

  it('dispatches confirm_consume_item with the phase as the only owner description', () => {
    const equip = makeEquipScreenPhase();
    const { controller, deps } = setup();

    controller.apply(
      { type: 'confirm_consume_item', instanceId: 'i1', unitTemplateId: 'warrior' },
      equip,
      equip,
    );

    // Exactly `{ previousPhase, action }` — no second `source` argument to disagree with the phase.
    expect(deps.applyConsumablePhaseAction).toHaveBeenCalledWith({
      previousPhase: equip,
      action: { type: 'confirm_consume_item', instanceId: 'i1', unitTemplateId: 'warrior' },
    });

    // Separately: the ORIGINAL phase reference, not a structural copy. `toHaveBeenCalledWith`
    // compares structurally, so it cannot make this claim — a facade that forwarded
    // `{ ...previousPhase }` would satisfy the assertion above and still be reconstructing the
    // owner description it is supposed to pass through.
    const [forwarded] = vi.mocked(deps.applyConsumablePhaseAction).mock.calls[0];
    expect(forwarded.previousPhase).toBe(equip);
  });
});

describe('phaseActionEffects RNG composition', () => {
  it('hands battle start the battleSetup stream', () => {
    const { controller, deps, rngPairs } = setup();

    controller.apply(
      { type: 'enter_battle', enemyGroupId: 'orc_patrol', triggerPos: { x: 1, y: 1 } },
      WORLD_MAP,
      BATTLE,
    );

    expect(deps.startBattleRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ battleSetupRng: rngPairs[0].battleSetup }),
    );
  });

  it('hands battle mutation the battleResolution stream', () => {
    const { controller, deps, rngPairs } = setup();

    controller.apply({ type: 'battle_decide_auto_turn' }, BATTLE, BATTLE);

    expect(deps.applyBattleRuntimeMutation).toHaveBeenCalledWith(
      expect.objectContaining({ battleResolutionRng: rngPairs[0].battleResolution }),
    );
  });

  it('gives replay no RNG at all', () => {
    // Replay restores captured enemy placement; drawing would desync it from the original.
    const { controller, deps } = setup();

    controller.apply({ type: 'replay' }, BATTLE, { ...BATTLE });

    expect(deps.replayBattleRuntime).toHaveBeenCalledTimes(1);
    expect(deps.replayBattleRuntime).toHaveBeenCalledWith(BATTLE);
  });

  it('replaces the entire stream pair on a lifecycle reset', () => {
    const { controller, deps, rngPairs } = setup();

    controller.apply({ type: 'exit_to_menu' }, WORLD_MAP, MAIN_MENU);
    controller.apply(
      { type: 'enter_battle', enemyGroupId: 'orc_patrol', triggerPos: { x: 1, y: 1 } },
      WORLD_MAP,
      BATTLE,
    );

    // Two pairs exist: the construction pair and the post-reset one. Battle start must have
    // received the NEW pair's stream — not a mutated field of the old pair.
    expect(rngPairs).toHaveLength(2);
    expect(rngPairs[1].battleSetup).not.toBe(rngPairs[0].battleSetup);
    expect(deps.startBattleRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ battleSetupRng: rngPairs[1].battleSetup }),
    );
  });

  it('never shares a stream pair between two controllers', () => {
    // The pair must live in the factory closure. A module-level pair would make a lifecycle
    // reset in one PhaseManager silently reseed every other.
    const enterBattle: PhaseAction = {
      type: 'enter_battle',
      enemyGroupId: 'orc_patrol',
      triggerPos: { x: 1, y: 1 },
    };
    const a = setup();
    const b = setup();

    a.controller.apply(enterBattle, WORLD_MAP, BATTLE);
    // A lifecycle reset in `a` must be invisible to `b`.
    a.controller.apply({ type: 'exit_to_menu' }, WORLD_MAP, MAIN_MENU);
    b.controller.apply(enterBattle, WORLD_MAP, BATTLE);

    expect(a.rngPairs[0]).not.toBe(b.rngPairs[0]);
    expect(a.deps.startBattleRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ battleSetupRng: a.rngPairs[0].battleSetup }),
    );
    expect(b.deps.startBattleRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ battleSetupRng: b.rngPairs[0].battleSetup }),
    );
    // `b` still holds its construction pair — `a`'s reset created a pair only `a` can see.
    expect(b.rngPairs).toHaveLength(1);
    expect(a.rngPairs).toHaveLength(2);
  });
});

describe('phaseActionEffects fails closed on impossible accepted inputs', () => {
  /**
   * Resolver rejection is silent and public: the facade is never called and `transition()`
   * returns `{ status: 'rejected' }`. But once an action has been ACCEPTED, a mismatched
   * previousPhase is lifecycle corruption — a wrong resolver guard, broken coordinator data
   * flow, or a half-implemented action — and must not be absorbed as a no-op.
   *
   * Every pair below is unreachable through `PhaseManager` today: each has a
   * matching-or-stricter guard in `resolveTransition`.
   */
  const impossible: Array<[string, PhaseAction, GamePhase]> = [
    ['battle mutation from world_map', { type: 'battle_use_skill', unitId: 'p1', target: { side: 'enemy', row: 0, col: 0 } }, WORLD_MAP],
    ['battle placement from main_menu', { type: 'clear_placement_selection' }, MAIN_MENU],
    ['replay from world_map', { type: 'replay' }, WORLD_MAP],
    ['exit_battle from world_map', { type: 'exit_battle', outcome: 'victory' }, WORLD_MAP],
    ['move_party from battle', { type: 'move_party', partyPos: { x: 1, y: 1 } }, BATTLE],
    ['equip_item from world_map', { type: 'equip_item', instanceId: 'i1', unitTemplateId: 'soldier' }, WORLD_MAP],
    ['toggle_camp_unit from world_map', { type: 'toggle_camp_unit', templateId: 'soldier' }, WORLD_MAP],
    ['choose_upgrade from main_menu', { type: 'choose_upgrade', tierId: 5, upgradeId: 'x' as never }, MAIN_MENU],
  ];

  it.each(impossible)('throws for %s and runs no owner', (_label, action, previousPhase) => {
    const { controller, calls } = setup();

    expect(() => controller.apply(action, previousPhase, WORLD_MAP)).toThrow(
      /phaseActionEffects: /,
    );
    expect(calls).toEqual([]);
  });

  it.each([
    ['buy_item', { type: 'buy_item', definitionId: 'sword' } as PhaseAction],
    ['sell_item', { type: 'sell_item', instanceId: 'i1' } as PhaseAction],
  ])('throws for unsupported commerce action %s', (_label, action) => {
    // resolveTransition returns null for both today. If a shop phase is ever added, the
    // implementer must make an explicit effects decision here rather than shipping a
    // silently applied no-op.
    const { controller, calls } = setup();

    expect(() => controller.apply(action, WORLD_MAP, WORLD_MAP)).toThrow(
      /no shop phase exists yet/,
    );
    expect(calls).toEqual([]);
  });
});

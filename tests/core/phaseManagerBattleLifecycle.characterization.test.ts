/// <reference types="vite/client" />
import { describe, it, expect, afterEach } from 'vitest';
// Raw source of the action union, for the runtime exhaustiveness guard below.
// Uses Vite's `?raw` (already a project dependency) rather than node:fs, since
// @types/node is not installed in this repo.
import phasesSource from '../../src/core/phases.ts?raw';
import {
  createLifecycleHarness,
  resetGameStateBetweenTests,
  requireInstalledRuntime,
  hasInstalledRuntime,
  projectEnemyPlacements,
  ORC_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_TRIGGER_POS,
} from './helpers/phaseManagerLifecycleHarness';
import { GameState } from '../../src/core/GameState';
import { writeBattleRuntimeSlot } from '../../src/core/battleRuntimeStorage';
import { resolveTransition } from '../../src/core/phaseTransitionResolver';
import type { PhaseAction, GamePhase } from '../../src/core/phases';
import type { UpgradeOptionId } from '../../src/shared/unitTypes';

/**
 * One valid sample per PhaseAction discriminator.
 *
 * The `satisfies` clause below is the primary intent: TypeScript rejects the
 * object unless every `PhaseAction["type"]` has exactly one entry.
 *
 * IMPORTANT: that compile-time guard does NOT run in this repo's checks —
 * `tsconfig.json` sets `"include": ["src"]`, so `tsc` never sees `tests/**`,
 * and Vitest transpiles without type-checking. (Verified: deleting an entry
 * still passes `npm run build`.) The union is therefore ALSO re-derived from
 * source at runtime in the exhaustiveness test below, so a newly added
 * PhaseAction actually fails a running test rather than passing silently.
 * If `tests/**` is ever added to a typecheck step, the `satisfies` guard
 * starts working too and the two become mutually reinforcing.
 */
type ActionSampleByType = {
  [T in PhaseAction['type']]: Extract<PhaseAction, { type: T }>;
};

/** Re-derives the PhaseAction discriminators from source, independent of TS. */
function readPhaseActionTypesFromSource(): string[] {
  const source = phasesSource;
  const start = source.indexOf('export type PhaseAction =');
  if (start === -1) {
    throw new Error('Could not locate "export type PhaseAction =" in src/core/phases.ts');
  }
  // The union declaration ends at the first blank line after it.
  const end = source.indexOf('\n\n', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  const names = [...block.matchAll(/\{\s*type:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  if (names.length === 0) {
    throw new Error('Parsed zero PhaseAction variants — the union format changed');
  }
  return names;
}

const ACTION_SAMPLES = {
  new_game: { type: 'new_game' },
  debug: { type: 'debug' },
  enter_battle: {
    type: 'enter_battle',
    enemyGroupId: ORC_PATROL_ENEMY_GROUP_ID,
    triggerPos: ORC_PATROL_TRIGGER_POS,
  },
  enter_camp: { type: 'enter_camp' },
  exit_camp: { type: 'exit_camp' },
  start_battle: { type: 'start_battle', enemyGroupId: ORC_PATROL_ENEMY_GROUP_ID },
  exit_battle: { type: 'exit_battle', outcome: 'victory' },
  exit_results: { type: 'exit_results' },
  replay: { type: 'replay' },
  exit_to_menu: { type: 'exit_to_menu' },
  move_party: { type: 'move_party', partyPos: { x: 2, y: 7 } },
  open_equip_screen: { type: 'open_equip_screen', unitTemplateId: 'soldier' },
  close_equip_screen: { type: 'close_equip_screen' },
  switch_equip_unit: { type: 'switch_equip_unit', templateId: 'soldier' },
  equip_item: { type: 'equip_item', instanceId: 'inst_1', unitTemplateId: 'soldier' },
  unequip_item: { type: 'unequip_item', unitTemplateId: 'soldier', slot: 'accessory' },
  open_item_actions: { type: 'open_item_actions', instanceId: 'inst_1' },
  close_item_actions: { type: 'close_item_actions' },
  select_item_action: { type: 'select_item_action', instanceId: 'inst_1', action: 'use' },
  request_use_item: { type: 'request_use_item', instanceId: 'inst_1' },
  confirm_use_item: {
    type: 'confirm_use_item', instanceId: 'inst_1', unitTemplateId: 'soldier',
  },
  cancel_use_item: { type: 'cancel_use_item' },
  buy_item: { type: 'buy_item', definitionId: 'item_1' },
  sell_item: { type: 'sell_item', instanceId: 'inst_1' },
  toggle_camp_unit: { type: 'toggle_camp_unit', templateId: 'soldier' },
  open_upgrade_tree: { type: 'open_upgrade_tree' },
  close_upgrade_tree: { type: 'close_upgrade_tree' },
  choose_upgrade: {
    type: 'choose_upgrade',
    tierId: 5,
    upgradeId: 'upgrade_sample' as UpgradeOptionId,
  },
  init_debug: { type: 'init_debug', level: 1 },
  reset_debug_session: { type: 'reset_debug_session' },
  return_to_debug_level_select: { type: 'return_to_debug_level_select' },
  switch_debug_unit: { type: 'switch_debug_unit', templateId: 'soldier' },
  select_bench_slot: { type: 'select_bench_slot', benchIdx: 0 },
  select_field_unit: { type: 'select_field_unit', unitId: 'p1' },
  clear_placement_selection: { type: 'clear_placement_selection' },
  place_bench_unit: {
    type: 'place_bench_unit',
    benchIdx: 0,
    anchor: { side: 'player', row: 0, col: 0 },
  },
  swap_bench_with_field: { type: 'swap_bench_with_field', benchIdx: 0, fieldUnitId: 'p1' },
  move_field_unit: {
    type: 'move_field_unit',
    unitId: 'p1',
    anchor: { side: 'player', row: 0, col: 1 },
  },
  move_field_unit_to_bench: { type: 'move_field_unit_to_bench', unitId: 'p1', benchIdx: 0 },
  return_field_unit_to_bench: { type: 'return_field_unit_to_bench', unitId: 'p1' },
  swap_field_units: { type: 'swap_field_units', unitAId: 'p1', unitBId: 'p2' },
  battle_begin_combat: { type: 'battle_begin_combat' },
  battle_mark_quick_battle_complete: { type: 'battle_mark_quick_battle_complete' },
  battle_set_mode: { type: 'battle_set_mode', mode: 'auto' },
  battle_prepare_quick_battle: { type: 'battle_prepare_quick_battle' },
  battle_start_turn: { type: 'battle_start_turn' },
  battle_select_skill: { type: 'battle_select_skill', skillIndex: 0 },
  battle_use_skill: {
    type: 'battle_use_skill',
    unitId: 'p1',
    target: { side: 'enemy', row: 0, col: 0 },
  },
  battle_select_item: { type: 'battle_select_item', unitId: 'p1', instanceId: 'inst_1' },
  battle_use_item: { type: 'battle_use_item', unitId: 'p1', instanceId: 'inst_1', target: null },
  battle_advance_turn: { type: 'battle_advance_turn' },
  battle_skip_turn: { type: 'battle_skip_turn' },
  battle_charge_turn: { type: 'battle_charge_turn' },
  battle_quick_turn: { type: 'battle_quick_turn', unitId: 'p1' },
  battle_decide_auto_turn: { type: 'battle_decide_auto_turn' },
  battle_apply_auto_turn: { type: 'battle_apply_auto_turn' },
  battle_preview_target: {
    type: 'battle_preview_target',
    target: { side: 'enemy', row: 0, col: 0 },
  },
  battle_clear_preview_target: { type: 'battle_clear_preview_target' },
} satisfies ActionSampleByType;

/**
 * `satisfies` permits only one sample per discriminator, but `exit_battle`
 * branches internally on `outcome` (victory -> battle_results, defeat ->
 * returnPhase). The other branch is added explicitly so the catalogue covers
 * routing branches, not just discriminators.
 */
const EXTRA_BRANCH_SAMPLES: PhaseAction[] = [{ type: 'exit_battle', outcome: 'defeat' }];

const ALL_SAMPLES: PhaseAction[] = [
  ...(Object.values(ACTION_SAMPLES) as PhaseAction[]),
  ...EXTRA_BRANCH_SAMPLES,
];

describe('PhaseManager battle runtime lifecycle', () => {
  afterEach(resetGameStateBetweenTests);

  describe('exit catalogue', () => {
    it('covers every PhaseAction variant declared in source', () => {
      // Runtime backstop for the `satisfies` guard, which this repo's tsc
      // config never evaluates (tests are outside "include": ["src"]).
      const declared = readPhaseActionTypesFromSource().sort();
      const catalogued = Object.keys(ACTION_SAMPLES).sort();

      expect(catalogued).toEqual(declared);
    });

    it('clears the battle runtime for every action that resolves to a non-battle phase', () => {
      // Build a real battle phase to classify against — not a hand-written
      // literal, so the classification runs against the true phase shape.
      const probe = createLifecycleHarness();
      probe.startNewCampaign();
      probe.openDebugSession(1);
      probe.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
      const representativeBattlePhase: GamePhase = probe.manager.getPhase();
      expect(representativeBattlePhase.type).toBe('battle');
      resetGameStateBetweenTests();

      const exitActions = ALL_SAMPLES.filter((action) => {
        const next = resolveTransition(representativeBattlePhase, action, {
          mapCleared: false,
        });
        // null => rejected; still 'battle' => not an exit.
        return next !== null && next.type !== 'battle';
      });

      // Guard against the filter silently matching nothing (which would make
      // this test vacuous if resolveTransition's shape ever changed).
      expect(exitActions.length).toBeGreaterThan(0);

      for (const action of exitActions) {
        const h = createLifecycleHarness();
        h.startNewCampaign();
        h.openDebugSession(1);
        h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
        expect(hasInstalledRuntime()).toBe(true);

        h.manager.transition(action);

        expect(
          hasInstalledRuntime(),
          `action "${action.type}" left a battle runtime installed after leaving battle`,
        ).toBe(false);

        resetGameStateBetweenTests();
      }
    });
  });

  describe('runtime entry, mutation and teardown', () => {
    it('campaign battle entry installs a runtime with sessionSource "campaign"', () => {
      const h = createLifecycleHarness();
      h.startNewCampaign();
      h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);

      expect(requireInstalledRuntime().sessionSource).toBe('campaign');
    });

    it('debug battle entry installs a runtime with sessionSource "debug"', () => {
      const h = createLifecycleHarness();
      h.startNewCampaign();
      h.openDebugSession(1);
      h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

      expect(requireInstalledRuntime().sessionSource).toBe('debug');
    });

    it('a rejected action neither replaces nor clears the active runtime', () => {
      const h = createLifecycleHarness();
      h.startNewCampaign();
      h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
      const runtimeBefore = requireInstalledRuntime();
      const phaseBefore = h.manager.getPhase();

      // 'enter_camp' is only accepted from world_map, so it is rejected here.
      h.manager.transition({ type: 'enter_camp' });

      expect(h.manager.getPhase()).toBe(phaseBefore);
      expect(requireInstalledRuntime()).toBe(runtimeBefore);
    });

    it('a mutation-only battle action updates runtime content without removing it', () => {
      const h = createLifecycleHarness();
      h.startNewCampaign();
      h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);

      h.manager.transition({ type: 'battle_set_mode', mode: 'auto' });

      expect(hasInstalledRuntime()).toBe(true);
      expect(requireInstalledRuntime().mode).toBe('auto');
      expect(h.manager.getPhase().type).toBe('battle');
    });
  });

  describe('replay', () => {
    for (const session of ['campaign', 'debug'] as const) {
      it(`${session} replay rebuilds an independent runtime and restores the enemy formation`, () => {
        const h = createLifecycleHarness();
        h.startNewCampaign();
        if (session === 'campaign') {
          h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
        } else {
          h.openDebugSession(1);
          h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
        }

        const before = requireInstalledRuntime();
        const placementsBefore = projectEnemyPlacements(before);

        h.manager.transition({ type: 'replay' });

        const after = requireInstalledRuntime();

        // Still a battle, and a genuinely new attempt.
        expect(h.manager.getPhase().type).toBe('battle');
        expect(after).not.toBe(before);
        expect(after.state).not.toBe(before.state);
        expect(after.participants).not.toBe(before.participants);
        expect(after.turnContext).not.toBe(before.turnContext);
        expect(after.replaySetup).not.toBe(before.replaySetup);

        // Session identity survives the attempt boundary.
        expect(after.sessionSource).toBe(session);

        // The captured formation is restored, not regenerated.
        expect(projectEnemyPlacements(after)).toEqual(placementsBefore);
      });
    }
  });

  describe('sessionSource integrity', () => {
    it('throws instead of falling back when runtime and phase sessionSource disagree', () => {
      const h = createLifecycleHarness();
      h.startNewCampaign();
      h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);

      // Direct GameState mutation is used ONLY to build this corruption
      // fixture; the behavior under test is still driven through transition().
      const runtime = requireInstalledRuntime();
      writeBattleRuntimeSlot({ ...runtime, sessionSource: 'debug' });

      const campaignBefore = GameState.getCampaignState();
      const debugBefore = GameState.getDebugState();

      expect(() =>
        h.manager.transition({ type: 'battle_set_mode', mode: 'auto' }),
      ).toThrow(/sessionSource mismatch/i);

      // The failure must not have written into either storage tree.
      expect(GameState.getCampaignState()).toBe(campaignBefore);
      expect(GameState.getDebugState()).toBe(debugBefore);
    });
  });
});

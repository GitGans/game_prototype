import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LifecycleHarness } from './helpers/phaseManagerLifecycleHarness';

/**
 * Characterizes the gameplay-RNG lifecycle through observable gameplay output.
 *
 * `PhaseManagerClass.resetGameplayRngStreams()` is private and is called from
 * `new_game`, `init_debug`, `reset_debug_session` and `exit_to_menu`, replacing
 * the entire `GameplayRngStreams` pair. These tests never touch that method:
 * they mock only the exported `createDefaultGameplayRngStreams()` factory and
 * assert on placements / turn resolution, so they stay valid if Stage 3 moves
 * the RNG injection seam elsewhere but preserves the fresh-stream contract.
 *
 * `exit_to_menu` has no dedicated scenario here on purpose: every route back
 * into a battle passes through one of the three reset points below, which
 * resets the streams again, so a defect isolated to `exit_to_menu` has no
 * distinguishable observable signature. It is covered structurally by the
 * session-lifecycle suite instead.
 *
 * MODULE-GRAPH RULE: this file has zero static imports of production modules.
 * `battleRuntimeStorage` holds the active attempt in a module-level cell (as
 * `GameState` does for campaign/debug), so after `vi.resetModules()` a statically
 * imported copy would be a *different* cell than the one the dynamically imported
 * PhaseManager writes into — the assertions would read an empty slot and silently
 * not test the manager under test. Everything comes from the same dynamic graph,
 * established after `vi.doMock()`; the runtime is reached through the harness's
 * `requireInstalledRuntime()` rather than a static storage import.
 */

const RANDOM_MODULE = '../../src/core/random';
const HARNESS_MODULE = './helpers/phaseManagerLifecycleHarness';

const ORC_PATROL = 'orc_patrol';
const ORC_PATROL_POS = { x: 2, y: 2 } as const;

/**
 * Verified by probe: entering an `orc_patrol` battle consumes exactly six
 * `battleSetup` values. The race is fixed ('orc'), so no draw is spent on race
 * selection; `autoPlaceEnemies()` then visits 3 front-row and 3 back-row
 * columns against empty occupancy, calling pickOne() once per column.
 * If enemy placement changes, update this constant and this comment together.
 */
const ORC_PATROL_PLACEMENT_RNG_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

/**
 * An Rng that records consumption and can be poisoned once we expect it to
 * have been discarded, so reusing a stale stream fails loudly rather than
 * silently returning plausible numbers.
 */
class TrackingRng {
  calls = 0;
  private blocked = false;
  constructor(private readonly value = 0.5) {}
  next(): number {
    if (this.blocked) {
      throw new Error('stale battleResolution stream reused after lifecycle reset');
    }
    this.calls++;
    return this.value;
  }
  block(): void {
    this.blocked = true;
  }
}

async function loadWithScriptedSetupStream() {
  vi.doMock(RANDOM_MODULE, async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/core/random')>();
    return {
      ...actual,
      createDefaultGameplayRngStreams: () => ({
        battleSetup: new actual.ScriptedRng(ORC_PATROL_PLACEMENT_RNG_VALUES),
        battleResolution: new actual.MathRng(),
      }),
    };
  });
  const harness = await import(HARNESS_MODULE);
  return { ...harness };
}

async function loadWithTrackedResolutionStream() {
  const resolutionStreams: TrackingRng[] = [];
  vi.doMock(RANDOM_MODULE, async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/core/random')>();
    return {
      ...actual,
      createDefaultGameplayRngStreams: () => {
        const battleResolution = new TrackingRng();
        resolutionStreams.push(battleResolution);
        return { battleSetup: new actual.MathRng(), battleResolution };
      },
    };
  });
  const harness = await import(HARNESS_MODULE);
  return { resolutionStreams, ...harness };
}

describe('PhaseManager RNG lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock(RANDOM_MODULE);
    vi.resetModules();
  });

  // ── battleSetup freshness ────────────────────────────────────────────────
  // A reused six-value stream would already be exhausted on the second battle,
  // so an identical placement projection proves a fresh stream was installed.

  it('new_game installs a fresh battleSetup stream even mid-battle', async () => {
    const { requireInstalledRuntime, createLifecycleHarness, projectEnemyPlacements } =
      await loadWithScriptedSetupStream();

    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS);
    const first = projectEnemyPlacements(requireInstalledRuntime());

    h.startNewCampaign(); // dispatched mid-battle
    h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS);
    const second = projectEnemyPlacements(requireInstalledRuntime());

    expect(second).toEqual(first);
  });

  it('init_debug installs a fresh battleSetup stream', async () => {
    const { requireInstalledRuntime, createLifecycleHarness, projectEnemyPlacements } =
      await loadWithScriptedSetupStream();

    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS);
    const first = projectEnemyPlacements(requireInstalledRuntime());

    // Must start from a CAMPAIGN battle: 'debug' is rejected from a battle
    // phase and from debug_equip_screen, so only a defeat back to world_map
    // reaches debug_level_select. exit_battle does not itself reset RNG, so
    // the stream stays consumed right up until init_debug.
    h.manager.transition({ type: 'exit_battle', outcome: 'defeat' });
    expect(h.manager.getPhase().type).toBe('world_map');

    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL);
    const second = projectEnemyPlacements(requireInstalledRuntime());

    expect(second).toEqual(first);
  });

  it('reset_debug_session installs a fresh battleSetup stream', async () => {
    const { requireInstalledRuntime, createLifecycleHarness, projectEnemyPlacements } =
      await loadWithScriptedSetupStream();

    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL);
    const first = projectEnemyPlacements(requireInstalledRuntime());

    // reset_debug_session is accepted only from debug_equip_screen, which is
    // exactly where a defeated debug battle returns.
    h.manager.transition({ type: 'exit_battle', outcome: 'defeat' });
    expect(h.manager.getPhase().type).toBe('debug_equip_screen');
    h.manager.transition({ type: 'reset_debug_session' });

    h.startDebugBattle(ORC_PATROL);
    const second = projectEnemyPlacements(requireInstalledRuntime());

    expect(second).toEqual(first);
  });

  // ── battleResolution freshness ───────────────────────────────────────────
  // Each row's route is dictated by which phase its reset action is accepted
  // from, and by where exit_battle(defeat) returns — so the routes are spelled
  // out per case rather than branching on "new_game vs. everything else".

  interface ResolutionCase {
    name: string;
    enterFirstBattle(h: LifecycleHarness): void;
    resetAndReenter(h: LifecycleHarness): void;
  }

  const RESOLUTION_CASES: ResolutionCase[] = [
    {
      name: 'new_game',
      enterFirstBattle: (h) => h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS),
      resetAndReenter: (h) => {
        h.startNewCampaign(); // mid-battle; resets both streams
        h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS);
      },
    },
    {
      name: 'init_debug',
      // Campaign, not debug: exit_battle(defeat) must land on world_map, since
      // 'debug' -> debug_level_select is rejected from debug_equip_screen.
      enterFirstBattle: (h) => h.startCampaignBattle(ORC_PATROL, ORC_PATROL_POS),
      resetAndReenter: (h) => {
        h.manager.transition({ type: 'exit_battle', outcome: 'defeat' });
        expect(h.manager.getPhase().type).toBe('world_map');
        h.openDebugSession(1); // 'debug' -> 'init_debug'; resets both streams
        h.startDebugBattle(ORC_PATROL);
      },
    },
    {
      name: 'reset_debug_session',
      enterFirstBattle: (h) => {
        h.openDebugSession(1);
        h.startDebugBattle(ORC_PATROL);
      },
      resetAndReenter: (h) => {
        h.manager.transition({ type: 'exit_battle', outcome: 'defeat' });
        expect(h.manager.getPhase().type).toBe('debug_equip_screen');
        h.manager.transition({ type: 'reset_debug_session' }); // resets both streams
        h.startDebugBattle(ORC_PATROL);
      },
    },
  ];

  it.each(RESOLUTION_CASES)(
    '$name installs a fresh battleResolution stream',
    async ({ enterFirstBattle, resetAndReenter }) => {
      const { resolutionStreams, createLifecycleHarness } =
        await loadWithTrackedResolutionStream();

      const h = createLifecycleHarness();
      h.startNewCampaign();

      enterFirstBattle(h);
      const firstStream = resolutionStreams.at(-1)!;
      h.consumeBattleResolutionRng();
      // Probe-validity guard: if the consuming path ever stops drawing, this
      // fails loudly instead of the whole test passing vacuously.
      expect(firstStream.calls).toBeGreaterThan(0);

      firstStream.block(); // any later use of this instance now throws

      resetAndReenter(h);

      expect(() => h.consumeBattleResolutionRng()).not.toThrow();
      expect(resolutionStreams.at(-1)).not.toBe(firstStream);
      expect(resolutionStreams.at(-1)!.calls).toBeGreaterThan(0);
    },
  );
});

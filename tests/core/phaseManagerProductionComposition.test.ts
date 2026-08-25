import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Guards Stage 3D's primary composition guarantee: EVERY `createProductionPhaseManager()` call
 * builds its own `PhaseActionEffectsController`.
 *
 * That controller owns the gameplay RNG stream pair in a factory closure, so a hoisted
 * module-scope controller would let one manager's lifecycle reset (`new_game`, `init_debug`,
 * `reset_debug_session`, `exit_to_menu`) silently reseed another manager's streams. The
 * dangerous part is that hoisting compiles, keeps navigation working, and still passes the RNG
 * characterization suite — which only ever proves that two INDEPENDENTLY CONSTRUCTED
 * controllers are isolated, never that the production factory constructs a new one per call.
 *
 * MODULE-GRAPH RULE: zero static production imports, same discipline as
 * `phaseManagerRngLifecycle.characterization.test.ts`. The mock deliberately does NOT spread
 * the real module: `PhaseManager.ts` consumes exactly one runtime binding from
 * `phaseActionEffects`, so skipping `importOriginal` keeps the real RNG, the domain owners and
 * the `GameState` singleton out of this test entirely.
 */

const EFFECTS_MODULE = '../../src/core/phaseActionEffects';
const PHASE_MANAGER_MODULE = '../../src/core/PhaseManager';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock(EFFECTS_MODULE);
  vi.resetModules();
});

describe('production PhaseManager composition', () => {
  it('gives every produced manager its own effects controller', async () => {
    // Which controller handled each apply() call, in order.
    const applyingControllerIds: number[] = [];
    let controllersCreated = 0;

    const createDefaultPhaseActionEffects = vi.fn(() => {
      const id = controllersCreated++;
      return {
        apply: vi.fn(() => {
          applyingControllerIds.push(id);
          return { battleFeedback: null };
        }),
      };
    });

    vi.doMock(EFFECTS_MODULE, () => ({ createDefaultPhaseActionEffects }));

    // Importing the module evaluates `export const PhaseManager = createProductionPhaseManager()`,
    // so the exported singleton accounts for controller id 0.
    const { createProductionPhaseManager } = await import(PHASE_MANAGER_MODULE);
    expect(createDefaultPhaseActionEffects).toHaveBeenCalledTimes(1);

    const first = createProductionPhaseManager();
    const second = createProductionPhaseManager();

    // A hoisted module-scope controller would leave this at 1.
    expect(createDefaultPhaseActionEffects).toHaveBeenCalledTimes(3);

    // `main_menu` + `debug` resolves to the snapshotless `debug_level_select`, so this is a
    // real navigation through the real resolver and the real snapshot rebuilder without
    // touching GameState — only the effects controller is faked.
    first.init({ sync: vi.fn() });
    second.init({ sync: vi.fn() });
    first.transition({ type: 'debug' });
    second.transition({ type: 'debug' });

    // Each manager dispatched into the controller created for IT, not a shared one.
    expect(applyingControllerIds).toEqual([1, 2]);
  });
});

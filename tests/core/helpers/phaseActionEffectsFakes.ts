import { vi } from 'vitest';
import type {
  PhaseActionEffectsDependencies,
  GameplayRngStreams,
} from '../../../src/core/phaseActionEffects';
import { NO_PHASE_EFFECTS } from '../../../src/core/phaseEffectsResult';
import type { Rng } from '../../../src/shared/random';

/**
 * A complete fake dependency set for `createPhaseActionEffects()`.
 *
 * `PhaseActionEffectsDependencies` has no optional fields precisely so a forgotten fake is a
 * compile error rather than a silent call into the real owner (which would mutate the
 * `GameState` singleton and leak across tests). This helper is the single place that
 * completeness is maintained — tests take it and override only what they assert on.
 */

/** A recognisable non-functional Rng: drawing from it in a test is a bug, so it throws. */
function inertRng(label: string): Rng {
  return {
    next(): number {
      throw new Error(`inertRng(${label}): a test drew from an RNG stream it did not expect`);
    },
  };
}

let rngPairSerial = 0;

/**
 * Produces a fresh, identity-distinguishable stream pair on every call, so a test can assert
 * "the pair was replaced" or "these two controllers hold different pairs" by reference.
 */
export function makeSentinelRngStreams(): GameplayRngStreams {
  rngPairSerial += 1;
  return {
    battleSetup: inertRng(`battleSetup#${rngPairSerial}`),
    battleResolution: inertRng(`battleResolution#${rngPairSerial}`),
  };
}

export interface FakeEffectsDependencies {
  deps: PhaseActionEffectsDependencies;
  /** Owner-call log in invocation order, for exact ordering assertions. */
  calls: string[];
  /** Every stream pair handed out by `createRngStreams`, oldest first. */
  rngPairs: GameplayRngStreams[];
}

export function makeFakeEffectsDependencies(
  overrides: Partial<PhaseActionEffectsDependencies> = {},
): FakeEffectsDependencies {
  const calls: string[] = [];
  const rngPairs: GameplayRngStreams[] = [];
  const record = <T>(name: string, result: T) => (): T => {
    calls.push(name);
    return result;
  };

  const deps: PhaseActionEffectsDependencies = {
    createRngStreams: () => {
      calls.push('rng');
      const pair = makeSentinelRngStreams();
      rngPairs.push(pair);
      return pair;
    },
    initializeNewCampaign: record('campaign', undefined),
    initializeDebugSessionForLevel: vi.fn(() => {
      calls.push('debugInit');
    }),
    resetDebugSession: record('debugReset', undefined),
    clearDebugSession: record('clearDebug', undefined),
    applyMovePartyPhaseAction: vi.fn(() => {
      calls.push('moveParty');
    }),
    applyBattleWorldConsequence: vi.fn(() => {
      calls.push('worldConsequence');
    }),
    applyEquipmentPhaseAction: vi.fn(() => {
      calls.push('equipment');
    }),
    beginItemUseConfirmation: vi.fn(() => {
      calls.push('consumeOpen');
    }),
    clearItemInteractionIfPresent: vi.fn(() => {
      calls.push('consumeClear');
    }),
    // Runs on EVERY transition, like the battle-runtime finalizer, so it is deliberately not
    // logged into `calls`: the lifecycle-ordering assertions describe action-specific effects.
    teardownItemInteractionAfterTransition: vi.fn(),
    applyItemUsePhaseAction: vi.fn(() => {
      calls.push('consumable');
    }),
    applyCampPhaseAction: vi.fn(() => {
      calls.push('camp');
      return { ok: true } as never;
    }),
    applyChooseUpgradePhaseAction: vi.fn(() => {
      calls.push('upgrade');
      return { ok: true } as never;
    }),
    startBattleRuntime: vi.fn(() => {
      calls.push('battleStart');
    }),
    replayBattleRuntime: vi.fn(() => {
      calls.push('replay');
    }),
    finalizeBattleSessionOnExit: vi.fn(() => {
      calls.push('sessionFinalization');
    }),
    applyBattleRuntimeMutation: vi.fn(() => {
      calls.push('battleMutation');
      return NO_PHASE_EFFECTS;
    }),
    clearBattleRuntimeIfPresent: record('clearRuntime', undefined),
    teardownBattleRuntimeAfterTransition: vi.fn(() => {
      calls.push('teardown');
    }),
    ...overrides,
  };

  // `createRngStreams` is the one dependency the controller calls during construction, so an
  // override must still feed rngPairs for the identity assertions to stay meaningful.
  if (overrides.createRngStreams) {
    const supplied = overrides.createRngStreams;
    deps.createRngStreams = () => {
      calls.push('rng');
      const pair = supplied();
      rngPairs.push(pair);
      return pair;
    };
  }

  return { deps, calls, rngPairs };
}

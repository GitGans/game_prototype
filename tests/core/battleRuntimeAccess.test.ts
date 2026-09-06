import { describe, it, expect, beforeEach } from 'vitest';
import { requireBattleRuntimeForPhase } from '../../src/core/battleRuntimeAccess';
import {
  writeBattleRuntimeSlot,
  clearBattleRuntimeSlot,
} from '../../src/core/battleRuntimeStorage';
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
} from '../../src/core/battleRuntimeContext';
import type { PlayerSessionSource } from '../../src/core/playerSessionState';
import { makeBattlePhase } from './helpers/phaseFixtures';

/**
 * VALIDATION SEMANTICS ONLY — the counterpart of `battleRuntimeStorage.test.ts`.
 *
 * `requireBattleRuntimeForPhase()` is the ONLY production read path: there is no unvalidated
 * getter anywhere since Stage 4B removed `GameState.getBattleRuntime()`. Both rules it owns are
 * pinned here, because both are load-bearing session-isolation guards rather than defensive
 * style — a debug runtime resolving for a campaign phase would let one session read and persist
 * into the other's storage tree.
 *
 * The runtime is installed through the test-only storage primitive: constructing a corrupted
 * (source-mismatched) state is deliberately impossible through any production path.
 */

function installRuntime(sessionSource: PlayerSessionSource) {
  const runtime = createBattleRuntimeContext({
    state: createEmptyBattleState(),
    participants: [],
    replaySetup: { enemyPlacements: [] },
    sessionSource,
  });
  writeBattleRuntimeSlot(runtime);
  return runtime;
}

describe('requireBattleRuntimeForPhase', () => {
  beforeEach(clearBattleRuntimeSlot);

  it('throws when no runtime is installed', () => {
    // The message moved here from GameState in Stage 4B and is unchanged: storage returning
    // null is a legitimate state (no battle active), so the error belongs to the gateway that
    // was asked for a runtime, not to the cell.
    expect(() => requireBattleRuntimeForPhase(makeBattlePhase())).toThrow(
      'Battle runtime is not initialized',
    );
  });

  it('throws on a runtime/phase sessionSource mismatch, without falling back', () => {
    installRuntime('debug');

    expect(() =>
      requireBattleRuntimeForPhase(makeBattlePhase({ sessionSource: 'campaign' })),
    ).toThrow(/sessionSource mismatch: runtime="debug", phase="campaign"/);
  });

  it('returns the installed runtime by reference when the source matches', () => {
    const runtime = installRuntime('campaign');

    // toBe: the validated read hands back the live runtime, never a copy — every caller then
    // computes its complete replacement from that exact object.
    expect(requireBattleRuntimeForPhase(makeBattlePhase({ sessionSource: 'campaign' }))).toBe(
      runtime,
    );
  });

  it('validates each source independently — a debug phase resolves a debug runtime', () => {
    const runtime = installRuntime('debug');

    expect(requireBattleRuntimeForPhase(makeBattlePhase({ sessionSource: 'debug' }))).toBe(
      runtime,
    );
  });
});

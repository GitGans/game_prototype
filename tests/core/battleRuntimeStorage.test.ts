import { describe, it, expect, beforeEach } from 'vitest';
import {
  readBattleRuntimeSlot,
  writeBattleRuntimeSlot,
  clearBattleRuntimeSlot,
} from '../../src/core/battleRuntimeStorage';
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
} from '../../src/core/battleRuntimeContext';
import type { PlayerSessionSource } from '../../src/core/playerSessionState';

/**
 * STORAGE SEMANTICS ONLY.
 *
 * `battleRuntimeStorage` owns one nullable cell and no rules — no phase check, no
 * `sessionSource` validation, no lifecycle decision. Initialization and source validation are
 * `battleRuntimeAccess`'s contract and are tested in `battleRuntimeAccess.test.ts`; a
 * `sessionSource` assertion in THIS file would tell a future reader that storage validates,
 * which is exactly the arrangement Stage 4B removed.
 */

function makeRuntime(sessionSource: PlayerSessionSource = 'campaign') {
  return createBattleRuntimeContext({
    state: createEmptyBattleState(),
    participants: [],
    replaySetup: { enemyPlacements: [] },
    sessionSource,
  });
}

describe('battleRuntimeStorage', () => {
  beforeEach(clearBattleRuntimeSlot);

  it('starts empty — no battle attempt is installed until one is written', () => {
    expect(readBattleRuntimeSlot()).toBeNull();
  });

  it('preserves the identity of the installed runtime — it stores, it does not copy', () => {
    const runtime = makeRuntime();

    writeBattleRuntimeSlot(runtime);

    // toBe, not toEqual: the caller computed a complete replacement and storage must hand back
    // that same object. A defensive copy here would silently break every identity assertion the
    // characterization suites use to prove a mutation-only action kept its runtime.
    expect(readBattleRuntimeSlot()).toBe(runtime);
  });

  it('replaces the complete reference on a second installation', () => {
    const first = makeRuntime('campaign');
    const second = makeRuntime('debug');

    writeBattleRuntimeSlot(first);
    writeBattleRuntimeSlot(second);

    // The whole attempt is swapped — the cell never merges fields of the previous runtime,
    // which is what makes "one write per action" a complete replacement rather than a patch.
    expect(readBattleRuntimeSlot()).toBe(second);
    expect(readBattleRuntimeSlot()).not.toBe(first);
  });

  it('empties the slot on clear', () => {
    writeBattleRuntimeSlot(makeRuntime());

    clearBattleRuntimeSlot();

    expect(readBattleRuntimeSlot()).toBeNull();
  });

  it('is idempotent on clear — disposing an empty slot is a no-op, never an error', () => {
    // Load-bearing: `clearBattleRuntimeIfPresent()` runs on session lifecycle actions dispatched
    // from ANY phase, including ones with no battle in flight, and no longer guards the call.
    expect(() => {
      clearBattleRuntimeSlot();
      clearBattleRuntimeSlot();
    }).not.toThrow();

    expect(readBattleRuntimeSlot()).toBeNull();
  });
});

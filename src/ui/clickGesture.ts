/**
 * Exclusive single/double click recognition. Game-agnostic input behaviour: no Phaser import, no
 * game data, no knowledge of what is being clicked.
 *
 * Phaser stays out through the injected `GestureScheduler`, which is also what makes the timing
 * rules testable without a scene.
 */

/** The window within which a second click on the same target is a double-click. */
export const DOUBLE_CLICK_WINDOW_MS = 300;

/** Schedules `run` after `delayMs` and returns a cancel function. */
export type GestureScheduler = (delayMs: number, run: () => void) => () => void;

export interface ClickGestureConfig {
  schedule: GestureScheduler;
  onSingle: (key: string) => void;
  onDouble: (key: string) => void;
  /** Defaults to `DOUBLE_CLICK_WINDOW_MS`. */
  windowMs?: number;
}

/**
 * Recognizes single and double clicks on one interactive target, exclusively.
 *
 * "Exclusively" is the whole point: a single click is DEFERRED until the window closes, so a
 * double-click emits `onDouble` and nothing else — never a single click first. Exactly one callback
 * fires per gesture, which is what lets one target carry two different actions.
 *
 * `key` identifies WHAT was clicked. Two clicks form a double-click only when their keys match, so a
 * target whose content changed between clicks produces two independent single clicks rather than one
 * double-click on the wrong thing.
 *
 * ── Coherence ───────────────────────────────────────────────────────────────────────────────────
 * A deferred click belongs to the state the target was showing when it happened. The owner is
 * responsible for calling `cancel()` whenever that state is replaced; `key` matching is a safety
 * net, not a substitute, because a key can repeat across a state change.
 *
 * This is transient input-recognition state, on a par with hover: it is never game state, nothing
 * renders from it, and it must not outlive the target it belongs to (hence `destroy()`).
 */
export class ClickGestureRecognizer {
  private pendingKey: string | null = null;
  private cancelPending: (() => void) | null = null;
  private destroyed = false;

  constructor(private readonly cfg: ClickGestureConfig) {}

  click(key: string): void {
    if (this.destroyed) return;

    if (this.pendingKey === key) {
      // Second click on the same target inside the window. Clearing BEFORE the callback matters:
      // the callback dispatches, and whatever that triggers must not find a pending gesture.
      this.clearPending();
      this.cfg.onDouble(key);
      return;
    }

    // A different target. The deferred click belongs to the previous one, so it is emitted now
    // rather than dropped — and the two can never combine into a double-click on either of them.
    this.flushPending();

    this.pendingKey = key;
    this.cancelPending = this.cfg.schedule(this.cfg.windowMs ?? DOUBLE_CLICK_WINDOW_MS, () => {
      this.cancelPending = null;
      this.pendingKey = null;
      if (!this.destroyed) this.cfg.onSingle(key);
    });
  }

  /**
   * Drops a deferred click WITHOUT emitting it — for a target whose state has been replaced, where
   * the pending gesture no longer refers to anything the player can still be said to have clicked.
   */
  cancel(): void {
    this.clearPending();
  }

  /** Permanent: a destroyed recognizer emits nothing and accepts no further clicks. */
  destroy(): void {
    this.destroyed = true;
    this.clearPending();
  }

  private flushPending(): void {
    const key = this.pendingKey;
    this.clearPending();
    if (key !== null) this.cfg.onSingle(key);
  }

  private clearPending(): void {
    this.cancelPending?.();
    this.cancelPending = null;
    this.pendingKey = null;
  }
}

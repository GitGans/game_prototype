import { describe, it, expect, vi } from "vitest";
import {
  ClickGestureRecognizer, DOUBLE_CLICK_WINDOW_MS,
} from "../../src/ui/clickGesture";

/**
 * A deterministic scheduler standing in for `scene.time.delayedCall`, in the style of the fake clock
 * in `tests/scenes/battleTurnFlowController.test.ts`. Injecting it is what makes the timing rules
 * testable at all: the recognizer imports no Phaser and needs no scene.
 */
function clock() {
  let now = 0;
  const pending: Array<{ at: number; run: () => void; cancelled: boolean }> = [];

  return {
    schedule: (delayMs: number, run: () => void) => {
      const entry = { at: now + delayMs, run, cancelled: false };
      pending.push(entry);
      return () => { entry.cancelled = true; };
    },
    /** Fires everything due at or before the new time, in order. */
    advance(ms: number): void {
      now += ms;
      for (const entry of [...pending]) {
        if (entry.cancelled || entry.at > now) continue;
        entry.cancelled = true;
        entry.run();
      }
    },
  };
}

function setup() {
  const onSingle = vi.fn();
  const onDouble = vi.fn();
  const c = clock();
  const gesture = new ClickGestureRecognizer({ schedule: c.schedule, onSingle, onDouble });
  return { gesture, onSingle, onDouble, advance: c.advance };
}

/** Just past the window, so a deferred single click is due. */
const PAST_WINDOW = DOUBLE_CLICK_WINDOW_MS + 1;

describe("ClickGestureRecognizer — exclusivity", () => {
  it("defers an isolated click and emits exactly one single when the window closes", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    // Nothing yet: the whole point is that a single click is not emitted until a double is ruled out.
    expect(onSingle).not.toHaveBeenCalled();

    advance(PAST_WINDOW);

    expect(onSingle.mock.calls).toEqual([["a"]]);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it("emits one double and NO single for a second click inside the window", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    advance(DOUBLE_CLICK_WINDOW_MS - 1);
    gesture.click("a");

    expect(onDouble.mock.calls).toEqual([["a"]]);
    expect(onSingle).not.toHaveBeenCalled();

    // And the suppressed single must not arrive late.
    advance(PAST_WINDOW);
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).toHaveBeenCalledTimes(1);
  });

  it("emits two singles for two clicks separated by more than the window", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    advance(PAST_WINDOW);
    gesture.click("a");
    advance(PAST_WINDOW);

    expect(onSingle.mock.calls).toEqual([["a"], ["a"]]);
    expect(onDouble).not.toHaveBeenCalled();
  });

  /**
   * Two clicks on different things are two gestures, never one double-click on either. The first is
   * flushed rather than dropped, so no click is silently swallowed.
   */
  it("never forms a double-click from two different keys", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    gesture.click("b");

    expect(onSingle.mock.calls).toEqual([["a"]]);
    expect(onDouble).not.toHaveBeenCalled();

    advance(PAST_WINDOW);

    expect(onSingle.mock.calls).toEqual([["a"], ["b"]]);
    expect(onDouble).not.toHaveBeenCalled();
  });
});

/**
 * The coherence guarantee. A deferred click belongs to the state its target was showing when it
 * happened; once the owner replaces that state the gesture refers to nothing and must not fire.
 * Matching keys are NOT a sufficient substitute for this — the same id can reappear across a state
 * change (a debug-session reset recreates the same authored instance ids).
 */
describe("ClickGestureRecognizer — cancellation", () => {
  it("emits neither callback after cancel()", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    gesture.cancel();
    advance(PAST_WINDOW);

    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it("starts a fresh gesture after cancel rather than completing the cancelled one", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    gesture.cancel();
    // Same key, immediately: this must NOT be read as the second half of the cancelled gesture.
    gesture.click("a");

    expect(onDouble).not.toHaveBeenCalled();

    advance(PAST_WINDOW);

    expect(onSingle.mock.calls).toEqual([["a"]]);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it("is a no-op with nothing pending", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    expect(() => { gesture.cancel(); gesture.cancel(); }).not.toThrow();
    advance(PAST_WINDOW);
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it("emits neither callback after destroy(), and accepts no further clicks", () => {
    const { gesture, onSingle, onDouble, advance } = setup();

    gesture.click("a");
    gesture.destroy();
    advance(PAST_WINDOW);

    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();

    gesture.click("a");
    gesture.click("a");   // would be a double-click on a live recognizer
    advance(PAST_WINDOW);

    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the SHARED dismissal mechanism in ModalFrame only: route wiring, one-shot teardown,
 * teardown-before-callback ordering, and ESC ownership/cleanup. Rendering, real hit-testing and
 * individual dialogs are deliberately out of scope.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────
// Only what ModalFrame touches as a VALUE during construction.
vi.mock("phaser", () => ({
  default: {
    Geom: {
      Rectangle: class {
        static Contains = (): boolean => true;
        constructor(
          readonly x: number,
          readonly y: number,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    },
    Input: { Keyboard: { KeyCodes: { ESC: 27 } } },
  },
}));

// Panel/Button extend Phaser.GameObjects.Container, so they must be replaced wholesale.
// `vi.hoisted` is required: vi.mock factories are hoisted above imports.
const spawned = vi.hoisted(() => ({
  log: [] as string[],
  buttons: [] as { cfg: { label: string; onClick: () => void } }[],
  panels: [] as { interactiveArgs: unknown[] | null }[],
}));

vi.mock("../../src/ui/Panel", () => ({
  Panel: class {
    interactiveArgs: unknown[] | null = null;
    constructor(readonly cfg: Record<string, unknown>) {
      spawned.panels.push(this);
    }
    setInteractive(...args: unknown[]): this {
      this.interactiveArgs = args;
      return this;
    }
    setDepth(): this {
      return this;
    }
    destroy(): void {
      spawned.log.push("destroy:panel");
    }
  },
}));

vi.mock("../../src/ui/Button", () => ({
  Button: class {
    constructor(readonly cfg: { label: string; onClick: () => void }) {
      spawned.buttons.push(this);
    }
    setDepth(): this {
      return this;
    }
    destroy(): void {
      spawned.log.push(`destroy:button(${this.cfg.label})`);
    }
  },
}));

// Imported after the mocks are registered.
import {
  ModalFrame,
  type ModalAction,
  type ModalDismissOptions,
  type ModalDismissReason,
} from "../../src/ui/ModalFrame";

// ── Minimal scene fixture ─────────────────────────────────────────────────────

type Handler = (...args: unknown[]) => void;

/** Just enough of Phaser's EventEmitter for the backdrop and the ESC Key. */
class Emitter {
  private readonly handlers = new Map<string, Handler[]>();
  on(event: string, fn: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  off(event: string, fn: Handler): this {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== fn));
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...args);
  }
  listenerCount(event: string): number {
    return this.listeners(event).length;
  }
  listeners(event: string): Handler[] {
    return [...(this.handlers.get(event) ?? [])];
  }
  has(event: string, fn: Handler | undefined): boolean {
    return fn !== undefined && this.listeners(event).includes(fn);
  }
}

class RectangleStub extends Emitter {
  interactive = false;
  setDepth(): this {
    return this;
  }
  setInteractive(): this {
    this.interactive = true;
    return this;
  }
  destroy(): void {
    spawned.log.push("destroy:overlay");
  }
}

class KeyStub extends Emitter {
  destroyed = false;
  destroy(): void {
    this.destroyed = true;
  }
}

const SCREEN_W = 800;
const SCREEN_H = 600;

function makeScene() {
  const overlay = new RectangleStub();
  const escapeKey = new KeyStub();
  const addKey = vi.fn((..._args: unknown[]) => escapeKey);

  const scene = {
    scale: { width: SCREEN_W, height: SCREEN_H },
    add: {
      rectangle: vi.fn(() => overlay),
      existing: vi.fn((object: unknown) => object),
    },
    input: { keyboard: { addKey } },
  };

  return { scene, overlay, escapeKey, addKey };
}

interface Harness {
  frame: ModalFrame;
  overlay: RectangleStub;
  escapeKey: KeyStub;
  addKey: ReturnType<typeof vi.fn>;
  dismissed: ModalDismissReason[];
  /** Buttons in construction order: close icon (if any), dismiss button (if any), then actions. */
  buttons: { cfg: { label: string; onClick: () => void } }[];
  panel: { interactiveArgs: unknown[] | null };
  /**
   * Sampled INSIDE the callback, not after it returns: was the frame's own ESC listener still
   * registered at the moment the callback ran? Stays null when no callback fires.
   */
  observed: { frameEscapeListenerAtCallback: boolean | null };
}

const ALL_ROUTES: ModalDismissOptions = {
  backdrop: true,
  closeIcon: true,
  button: { label: "Cancel" },
  escape: true,
};

const NO_ROUTES: ModalDismissOptions = {
  backdrop: false,
  closeIcon: false,
  button: false,
  escape: false,
};

const ESCAPE_ONLY: ModalDismissOptions = {
  backdrop: false,
  closeIcon: false,
  button: false,
  escape: true,
};

const PANEL_WIDTH = 320;
const CONTENT_HEIGHT = 120;

function mount(dismiss: ModalDismissOptions, actions?: ModalAction[]): Harness {
  const { scene, overlay, escapeKey, addKey } = makeScene();
  const dismissed: ModalDismissReason[] = [];
  const observed = { frameEscapeListenerAtCallback: null as boolean | null };

  // Filled in right after construction; the closures below read it only when a callback fires.
  const frameEscape: { handler?: Handler } = {};
  const sample = (): void => {
    observed.frameEscapeListenerAtCallback = escapeKey.has("down", frameEscape.handler);
  };

  const frame = new ModalFrame({
    scene: scene as never,
    width: PANEL_WIDTH,
    contentHeight: CONTENT_HEIGHT,
    dismiss,
    onDismiss: (reason) => {
      sample();
      dismissed.push(reason);
      spawned.log.push(`dismiss:${reason}`);
    },
    // Wrapped so the sample is taken inside the action callback too, before the caller's own spy.
    actions: actions?.map((action) => ({
      ...action,
      onSelect: () => {
        sample();
        action.onSelect();
      },
    })),
  });

  // The only 'down' listener at this point is the frame's own (escape enabled) — none otherwise.
  frameEscape.handler = escapeKey.listeners("down")[0];

  // Caller-owned content must be torn down with the frame.
  frame.add({ destroy: () => spawned.log.push("destroy:content") } as never);

  return {
    frame, overlay, escapeKey, addKey, dismissed, observed,
    buttons: spawned.buttons,
    panel: spawned.panels[0],
  };
}

/** Everything ModalFrame.teardown() must destroy, in no particular order. */
function teardownEntries(buttonLabels: string[]): string[] {
  return ["destroy:overlay", "destroy:panel",
    ...buttonLabels.map((l) => `destroy:button(${l})`), "destroy:content"];
}

/** Asserts full teardown happened and the callback (if any) ran strictly last. */
function expectTeardownThen(buttonLabels: string[], callbackEntry: string | null): void {
  const expected = teardownEntries(buttonLabels);
  const destroyed = spawned.log.filter((e) => e.startsWith("destroy:"));
  expect([...destroyed].sort()).toEqual([...expected].sort());
  if (callbackEntry === null) {
    expect(spawned.log).toEqual(destroyed);
  } else {
    expect(spawned.log.at(-1)).toBe(callbackEntry);
    expect(spawned.log.filter((e) => e === callbackEntry)).toHaveLength(1);
  }
}

beforeEach(() => {
  spawned.log.length = 0;
  spawned.buttons.length = 0;
  spawned.panels.length = 0;
});

// ── 1. Dismissal routes ───────────────────────────────────────────────────────

describe("ModalFrame dismissal routes", () => {
  // With ALL_ROUTES the buttons are, in construction order: close icon, then "Cancel".
  const CLOSE_ICON = 0;
  const CANCEL = 1;

  const cases: {
    name: string;
    reason: ModalDismissReason;
    fire: (h: Harness, event: { stopPropagation: () => void }) => void;
    consumesEvent: boolean;
  }[] = [
    {
      name: "backdrop pointerup",
      reason: "backdrop",
      fire: (h) => h.overlay.emit("pointerup"),
      consumesEvent: false,
    },
    {
      name: "close icon",
      reason: "close_icon",
      fire: (h) => h.buttons[CLOSE_ICON].cfg.onClick(),
      consumesEvent: false,
    },
    {
      name: "footer cancel button",
      reason: "button",
      fire: (h) => h.buttons[CANCEL].cfg.onClick(),
      consumesEvent: false,
    },
    {
      name: "escape key",
      reason: "escape",
      // Phaser's Key 'down' passes (key, event) — the native event is the SECOND argument.
      fire: (h, event) => h.escapeKey.emit("down", h.escapeKey, event),
      consumesEvent: true,
    },
  ];

  it.each(cases)("$name dismisses with reason '$reason'", ({ reason, fire, consumesEvent }) => {
    const h = mount(ALL_ROUTES);
    const labels = h.buttons.map((b) => b.cfg.label);
    const event = { stopPropagation: () => spawned.log.push("stopPropagation") };

    fire(h, event);

    expect(h.dismissed).toEqual([reason]);
    expectTeardownThen(labels, `dismiss:${reason}`);

    // The frame's ESC listener is gone BEFORE the callback runs — a callback may synchronously
    // start a transition or open another modal, and must not do so with a dead frame listening.
    expect(h.observed.frameEscapeListenerAtCallback).toBe(false);

    if (consumesEvent) {
      // The event is consumed BEFORE the modal resolves, for the same reason.
      expect(spawned.log[0]).toBe("stopPropagation");
    }

    // The key itself is plugin-owned and possibly shared: only our listener was removed.
    expect(h.escapeKey.listenerCount("down")).toBe(0);
    expect(h.escapeKey.destroyed).toBe(false);

    // Duplicate protection: retained callbacks and later public calls are inert.
    const after = [...spawned.log];
    const extraAction = vi.fn();
    h.buttons[CLOSE_ICON].cfg.onClick();
    h.frame.resolve(extraAction);
    h.frame.destroy();

    expect(h.dismissed).toEqual([reason]);
    expect(extraAction).not.toHaveBeenCalled();
    expect(spawned.log).toEqual(after);
  });
});

// ── 2. All routes disabled ────────────────────────────────────────────────────

describe("ModalFrame with every dismissal route disabled", () => {
  it("blocks background input without dismissing and never touches the ESC key", () => {
    const h = mount(NO_ROUTES);

    // Load-bearing: the scrim is interactive even with backdrop dismissal off, so a click
    // outside an undismissable modal is swallowed instead of reaching the screen underneath.
    // Both halves are needed — with no listener registered, "emitting does not dismiss" alone
    // would also pass on a scrim that was never made interactive.
    expect(h.overlay.interactive).toBe(true);
    expect(h.overlay.listenerCount("pointerup")).toBe(0);
    h.overlay.emit("pointerup");

    // The panel's dedicated hit area is what stops an inside click falling through to the scrim.
    // Mocks cannot prove Phaser's hit-testing; this proves the frame wires the hit area at all.
    const [hitArea, contains] = h.panel.interactiveArgs as [
      { x: number; y: number; width: number; height: number },
      unknown,
    ];
    expect(contains).toBeTypeOf("function");
    expect({ w: hitArea.width, h: hitArea.height })
      .toEqual({ w: h.frame.width, h: h.frame.height });
    expect({ x: hitArea.x, y: hitArea.y })
      .toEqual({ x: -h.frame.width / 2, y: -h.frame.height / 2 });

    // No close icon, no footer button.
    expect(h.buttons).toHaveLength(0);

    // Escape is never registered, and the key is neither consumed nor listened to.
    expect(h.addKey).not.toHaveBeenCalled();
    const event = { stopPropagation: vi.fn() };
    h.escapeKey.emit("down", h.escapeKey, event);
    expect(event.stopPropagation).not.toHaveBeenCalled();

    expect(h.dismissed).toEqual([]);
    expect(spawned.log).toEqual([]);
  });
});

// ── 3. Non-dismissal teardown paths ───────────────────────────────────────────

describe("ModalFrame non-dismissal teardown", () => {
  const ACTION_LABEL = "Confirm";

  const cases: {
    name: string;
    fire: (h: Harness) => void;
    callbackEntry: string | null;
    actionCalls: number;
  }[] = [
    {
      name: "action button resolves after teardown",
      fire: (h) => h.buttons.at(-1)!.cfg.onClick(),
      callbackEntry: `action:${ACTION_LABEL}`,
      actionCalls: 1,
    },
    {
      name: "destroy() tears down silently",
      fire: (h) => h.frame.destroy(),
      callbackEntry: null,
      actionCalls: 0,
    },
  ];

  it.each(cases)("$name", ({ fire, callbackEntry, actionCalls }) => {
    const onSelect = vi.fn(() => spawned.log.push(`action:${ACTION_LABEL}`));
    const h = mount(ESCAPE_ONLY, [{ label: ACTION_LABEL, style: "primary", onSelect }]);
    const labels = h.buttons.map((b) => b.cfg.label);

    // ESC registers with capture DISABLED: the frame must not leave a permanent
    // browser-level preventDefault on ESC behind.
    expect(h.addKey).toHaveBeenCalledWith(27, false);

    // A listener belonging to someone else on the shared, plugin-owned key.
    const foreign = vi.fn();
    h.escapeKey.on("down", foreign);

    fire(h);

    expect(h.dismissed).toEqual([]);
    expect(onSelect).toHaveBeenCalledTimes(actionCalls);
    expectTeardownThen(labels, callbackEntry);

    // Same ordering contract on the action path: the frame's listener is already gone when the
    // action runs. Null on the silent path, where no callback fires at all.
    expect(h.observed.frameEscapeListenerAtCallback).toBe(actionCalls === 1 ? false : null);

    // Teardown removes only the frame's listener; the shared key survives intact.
    expect(h.escapeKey.destroyed).toBe(false);
    expect(h.escapeKey.has("down", foreign)).toBe(true);
    expect(h.escapeKey.listenerCount("down")).toBe(1);
    h.escapeKey.emit("down", h.escapeKey, { stopPropagation: vi.fn() });
    expect(foreign).toHaveBeenCalledTimes(1);
    expect(h.dismissed).toEqual([]);

    // One-shot: repeats are inert.
    const after = [...spawned.log];
    h.buttons.at(-1)!.cfg.onClick();
    h.frame.destroy();
    expect(onSelect).toHaveBeenCalledTimes(actionCalls);
    expect(spawned.log).toEqual(after);
  });
});

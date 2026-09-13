import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PhaseAction, GamePhase } from "../../src/core/phases";
import type { BattleActionFeedback } from "../../src/core/battleActionFeedback";
import type { PhaseTransitionResult } from "../../src/core/phaseTransitionResult";
import type { FieldBattleUnitSnapshot, BattleActionBarEntry } from "../../src/shared/battleSnapshots";
import type { BattleDirectivePresentationInput } from "../../src/shared/battleDirectivePresentationModel";
import type { Side } from "../../src/shared/gridTypes";
import { buildBattleDirectivePresentation } from "../../src/objects/battleDirectivePresentation";
import { SHAPES } from "../../src/data/shapeDefinitions";
import { makeBattlePhase } from "../core/helpers/phaseFixtures";
import { testStrike, testMagicBolt } from "../battle/helpers/skills";

/**
 * Wiring of BattleTurnFlowController: which PhaseManager actions it dispatches, when, and what it
 * leaves scheduled. No browser and no real Phaser: Phaser, Button and PhaseManager are replaced,
 * and the battle behind PhaseManager is a small scripted model — the rules themselves are covered
 * by the battle/core suites, this suite pins only sequencing and presentation wiring.
 */

vi.mock("phaser", () => ({ default: {} }));

vi.mock("../../src/ui/Button", () => ({
  Button: class {
    setVisible() { return this; }
    setDisabled() { return this; }
    destroy() {}
  },
}));

type BattlePhase = Extract<GamePhase, { type: "battle" }>;

const pm = vi.hoisted(() => ({
  getPhase: (() => null) as () => unknown,
  transition: ((_a: unknown) => ({ status: "rejected" })) as (a: unknown) => unknown,
}));
vi.mock("../../src/core/PhaseManager", () => ({
  PhaseManager: {
    getPhase: () => pm.getPhase(),
    transition: (a: unknown) => pm.transition(a),
  },
}));

// Imported after the mocks are registered (vi.mock is hoisted above imports).
import { BattleTurnFlowController } from "../../src/scenes/controllers/BattleTurnFlowController";

// ─── Deterministic Phaser clock ───────────────────────────────────────────────

type FakeTimer = { at: number; cb: () => void; remove: () => void };

function makeClock() {
  let now = 0;
  const pending = new Set<FakeTimer>();
  return {
    delayedCall(delay: number, cb: () => void): FakeTimer {
      const t: FakeTimer = { at: now + delay, cb, remove: () => { pending.delete(t); } };
      pending.add(t);
      return t;
    },
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        const due = [...pending].filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        pending.delete(due);
        due.cb();
      }
      now = end;
    },
    get size(): number { return pending.size; },
  };
}

// ─── Scripted battle behind PhaseManager ──────────────────────────────────────

const NO_TARGET_TEXT = "Hero — The selected skill has no valid targets. Choose another action.";
const ATTACK_TEXT    = "Hero — Click on the red cell to attack";
const ENEMY_CELL     = { side: "enemy" as const, row: 0 as const, col: 0 as const };

const neutralPair = (n: number) => ({ highlightBase: n, value: n });

function unitSnapshot(id: string, side: Side, name: string, activeSkillIndex = 0): FieldBattleUnitSnapshot {
  return {
    id, side, name, className: "C", currentHp: 100, maxHp: 100, lifeState: "alive",
    statDisplay: {
      level: 1,
      hp: neutralPair(100), maxHp: neutralPair(100),
      physicalStrength: neutralPair(0), magicalStrength: neutralPair(0),
      physicalDefense: neutralPair(0), magicalDefense: neutralPair(0),
      dodge: neutralPair(0), block: neutralPair(0), initiative: neutralPair(0),
    },
    shape: SHAPES["1x1"],
    deployment: { kind: "field", anchor: { side, row: 0, col: 0 } },
    sprite: null,
    skills: [testStrike, testMagicBolt],
    activeSkillIndex,
    activeEffects: [],
    rowTrait: "front",
    templateId: id,
  };
}

/**
 * The hero's melee (skill 0) is blocked unless `meleeReachable`; its ranged skill (1) always has
 * the enemy cell. The queue rotates forever; an intention applies only while still current —
 * mirroring the runtime's stale-intention guard and `battle_set_mode` invalidation.
 */
class ScriptedBattle {
  mode: "manual" | "auto" | "quick" = "manual";
  queue: string[] = ["hero", "foe"];
  heroSkillIndex = 0;
  battlePhase: BattlePhase["battlePhase"] = "placement";
  pendingIntention: string | null = null;
  meleeReachable = false;
  rejectSetMode = false;
  skipEndsBattle = false;
  calls: PhaseAction[] = [];

  private get active(): string { return this.queue[0]; }
  private get activeSide(): Side { return this.active === "hero" ? "player" : "enemy"; }

  private targets() {
    if (this.battlePhase !== "select_target" || this.active !== "hero") return [];
    if (this.mode !== "manual") return [];
    return this.heroSkillIndex === 1 || this.meleeReachable ? [ENEMY_CELL] : [];
  }

  phase(): BattlePhase {
    const hero = unitSnapshot("hero", "player", "Hero", this.heroSkillIndex);
    const foe  = unitSnapshot("foe", "enemy", "Foe");
    const active = this.active === "hero" ? hero : foe;
    const actions: BattleActionBarEntry[] = active.skills.map((skill, skillIndex) => ({
      kind: "skill", skillIndex, skill,
    }));
    return makeBattlePhase({
      battlePhase:               this.battlePhase,
      battleMode:                this.mode,
      fieldUnits:                [hero, foe],
      unitsById:                 new Map([["hero", hero], ["foe", foe]]),
      roundQueue:                [...this.queue],
      activeUnitId:              active.id,
      activeUnit:                active,
      activeUnitSide:            active.side,
      activeUnitActions:         actions,
      manualTurnControlsVisible: this.mode === "manual" && active.side === "player",
      validTargets:              this.targets(),
    });
  }

  private rotate(): void { this.queue = [...this.queue.slice(1), this.queue[0]]; }

  private applied(feedback: BattleActionFeedback | null): PhaseTransitionResult {
    return { status: "applied", battleFeedback: feedback };
  }

  transition(action: PhaseAction): PhaseTransitionResult {
    this.calls.push(action);
    switch (action.type) {
      case "battle_begin_combat":
        this.battlePhase = "select_target";
        return this.applied(null);

      case "battle_set_mode":
        if (this.rejectSetMode) return { status: "rejected" };
        this.mode = action.mode;
        this.pendingIntention = null;
        return this.applied(null);

      case "battle_start_turn": {
        if (this.battlePhase === "end") {
          return this.applied({ events: [], directive: { type: "none", reason: "battle_ended" } });
        }
        if (this.active === "hero") this.heroSkillIndex = 0;
        if (this.activeSide === "enemy" || this.mode === "auto") {
          return this.applied({ events: [], directive: {
            type: "schedule_auto_turn", activeUnitId: this.active,
            delayKind: this.activeSide === "enemy" ? "auto_enemy" : "auto_player",
          } });
        }
        return this.applied({ events: [], directive: this.targets().length === 0
          ? { type: "await_manual_action", activeUnitId: this.active }
          : { type: "await_manual_target", activeUnitId: this.active, promptKind: "attack" } });
      }

      case "battle_select_skill":
        this.heroSkillIndex = action.skillIndex;
        return this.applied({ events: [] });

      case "battle_decide_auto_turn":
        if (this.activeSide === "player" && this.mode === "manual") {
          return this.applied({ events: [], autoTurnDirective: { type: "handoff_manual" } });
        }
        this.pendingIntention = this.active;
        return this.applied({ events: [], autoTurnDirective: {
          type: "intention",
          intention: { unitId: this.active, activeUnitSide: this.activeSide },
          animateAttack: true,
        } });

      case "battle_apply_auto_turn":
        if (this.pendingIntention === null || this.pendingIntention !== this.active) {
          return this.applied({ events: [], autoTurnApplied: false });
        }
        this.pendingIntention = null;
        this.rotate();
        return this.applied({ events: [], autoTurnApplied: true });

      case "battle_skip_turn":
        this.rotate();
        if (this.skipEndsBattle) {
          this.battlePhase = "end";
          return this.applied({ events: [], winner: "enemy" });
        }
        return this.applied({ events: [] });

      default:
        return this.applied({ events: [] });
    }
  }

  count(type: PhaseAction["type"], since = 0): number {
    return this.calls.slice(since).filter(a => a.type === type).length;
  }
}

// ─── Harness ──────────────────────────────────────────────────────────────────

let battle: ScriptedBattle;
let clock: ReturnType<typeof makeClock>;
let status: string;
let skillBar: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
let heroView: { setSpriteState: ReturnType<typeof vi.fn> };
let showGameOver: ReturnType<typeof vi.fn>;

function createController(): BattleTurnFlowController {
  return new BattleTurnFlowController({
    scene: { time: clock, scale: { width: 800, height: 600 } } as never,
    cellViews: new Map(),
    unitViews: new Map([["hero", heroView]]) as never,
    skillBar: skillBar as never,
    battlePresentation: {
      presentBattleEvents: vi.fn(),
      applyDirectivePresentation: (input: BattleDirectivePresentationInput) => {
        const presentation = buildBattleDirectivePresentation(input);
        if (presentation.statusText) status = presentation.statusText;
        return { displaySkillBar: presentation.displaySkillBar === true };
      },
    } as never,
    setStatus: (text: string) => { status = text; },
    refreshCells: vi.fn(),
    showGameOver,
    setBattleLogVisible: vi.fn(),
    cellPixelPos: () => ({ x: 0, y: 0 }),
    attachStateChangedListener: vi.fn(),
    detachStateChangedListener: vi.fn(),
  });
}

/** Selects an entry through the bar callback the controller handed to `skillBar.show`. */
function selectOnBar(entry: BattleActionBarEntry): void {
  const onSelect = skillBar.show.mock.calls.at(-1)![6] as (e: BattleActionBarEntry) => void;
  onSelect(entry);
}

beforeEach(() => {
  battle = new ScriptedBattle();
  clock = makeClock();
  status = "";
  skillBar = { show: vi.fn(), hide: vi.fn() };
  heroView = { setSpriteState: vi.fn() };
  showGameOver = vi.fn();
  pm.getPhase = () => battle.phase();
  pm.transition = (a) => battle.transition(a as PhaseAction);
});

// ─── Manual directives ────────────────────────────────────────────────────────

describe("manual turn start", () => {
  it("await_manual_action shows the bar and the no-target message, and schedules nothing", () => {
    createController().beginCombat();

    expect(skillBar.show).toHaveBeenCalledTimes(1);
    expect(status).toBe(NO_TARGET_TEXT);
    expect(clock.size).toBe(0);
  });

  it("await_manual_target shows the bar and the targeting prompt, and schedules nothing", () => {
    battle.meleeReachable = true;
    createController().beginCombat();

    expect(skillBar.show).toHaveBeenCalledTimes(1);
    expect(status).toBe(ATTACK_TEXT);
    expect(clock.size).toBe(0);
  });
});

describe("skill switching", () => {
  it("refreshes the prompt through the shared path without restarting the turn", () => {
    createController().beginCombat();
    const since = battle.calls.length;

    selectOnBar({ kind: "skill", skillIndex: 1, skill: testMagicBolt });
    expect(status).toBe(ATTACK_TEXT);
    expect(skillBar.show).toHaveBeenCalledTimes(2);

    selectOnBar({ kind: "skill", skillIndex: 0, skill: testStrike });
    expect(status).toBe(NO_TARGET_TEXT);
    expect(skillBar.show).toHaveBeenCalledTimes(3);

    expect(battle.count("battle_start_turn", since)).toBe(0);
    expect(battle.count("battle_select_skill", since)).toBe(2);
    expect(clock.size).toBe(0);
  });
});

// ─── Mode handoff ─────────────────────────────────────────────────────────────

describe("mode handoff", () => {
  it("manual → auto starts automatic processing without a grid click", () => {
    const controller = createController();
    controller.beginCombat();
    const since = battle.calls.length;

    controller.toggleAutoMode();
    expect(battle.calls.slice(since).map(a => a.type))
      .toEqual(["battle_set_mode", "battle_start_turn"]);

    clock.advance(200);
    expect(battle.count("battle_decide_auto_turn", since)).toBe(1);
    // The central preview invalidation is relied on; no extra clear action is dispatched.
    expect(battle.count("battle_clear_preview_target", since)).toBe(0);
  });

  it("auto → manual during the think delay restores controls and cancels the auto turn", () => {
    battle.mode = "auto";
    const controller = createController();
    controller.beginCombat();
    clock.advance(100);
    skillBar.show.mockClear();

    controller.toggleAutoMode();
    expect(skillBar.show).toHaveBeenCalledTimes(1);
    expect(status).toBe(NO_TARGET_TEXT);

    clock.advance(5000);
    expect(battle.count("battle_decide_auto_turn")).toBe(0);
    expect(battle.queue[0]).toBe("hero");
  });

  it("auto → manual during the impact delay restores controls and never applies", () => {
    battle.mode = "auto";
    const controller = createController();
    controller.beginCombat();
    clock.advance(200);                       // think → decide → impact scheduled
    expect(battle.count("battle_decide_auto_turn")).toBe(1);
    clock.advance(100);                       // inside the 200 ms impact window
    skillBar.show.mockClear();

    controller.toggleAutoMode();
    expect(skillBar.show).toHaveBeenCalledTimes(1);

    clock.advance(5000);
    expect(battle.count("battle_apply_auto_turn")).toBe(0);
    expect(battle.queue[0]).toBe("hero");
  });

  it("keeps an enemy turn going when the mode changes during it", () => {
    battle.queue = ["foe", "hero"];
    const controller = createController();
    controller.beginCombat();
    clock.advance(300);                       // inside the 700 ms enemy think
    const since = battle.calls.length;

    controller.toggleAutoMode();
    clock.advance(700);

    expect(battle.count("battle_decide_auto_turn", since)).toBe(1);
  });

  it("during a post-action delay, starts the already-current entry once and advances nothing", () => {
    const controller = createController();
    controller.beginCombat();
    controller.skipTurn();                    // queue → foe; next turn scheduled in 500 ms
    const since = battle.calls.length;
    clock.advance(100);

    controller.toggleAutoMode();
    clock.advance(500);                       // past the obsolete 500 ms continuation

    expect(battle.count("battle_start_turn", since)).toBe(1);
    expect(battle.count("battle_advance_turn", since)).toBe(0);
    expect(battle.queue[0]).toBe("foe");
  });

  it("rapid toggles leave exactly one live continuation", () => {
    const controller = createController();
    controller.beginCombat();

    controller.toggleAutoMode();              // → auto  (think scheduled)
    controller.toggleAutoMode();              // → manual (cancelled, waiting)
    controller.toggleAutoMode();              // → auto  (think scheduled)
    expect(clock.size).toBe(1);

    const since = battle.calls.length;
    clock.advance(200);
    expect(battle.count("battle_decide_auto_turn", since)).toBe(1);
  });

  it("a rejected mode change leaves existing scheduling untouched", () => {
    battle.mode = "auto";
    const controller = createController();
    controller.beginCombat();
    battle.rejectSetMode = true;
    const since = battle.calls.length;

    controller.toggleAutoMode();
    expect(clock.size).toBe(1);
    expect(battle.count("battle_start_turn", since)).toBe(0);

    clock.advance(200);
    expect(battle.count("battle_decide_auto_turn", since)).toBe(1);
  });

  it("an ended battle keeps its game-over presentation", () => {
    battle.skipEndsBattle = true;
    const controller = createController();
    controller.beginCombat();
    controller.skipTurn();                    // winner → game over scheduled
    const since = battle.calls.length;

    controller.toggleAutoMode();
    expect(battle.calls.length).toBe(since);  // not even battle_set_mode

    clock.advance(600);
    expect(showGameOver).toHaveBeenCalledWith("enemy");
  });

  it("a handoff does not cancel the attack sprite's idle reset", () => {
    battle.mode = "auto";
    const controller = createController();
    controller.beginCombat();
    clock.advance(200);                       // decide → attack animation + impact
    expect(heroView.setSpriteState).toHaveBeenCalledWith("attack");
    clock.advance(100);

    controller.toggleAutoMode();
    clock.advance(400);

    expect(heroView.setSpriteState).toHaveBeenLastCalledWith("idle");
  });
});

describe("destroyed controller", () => {
  it("never resumes processing", () => {
    battle.mode = "auto";
    const controller = createController();
    controller.beginCombat();
    const since = battle.calls.length;

    controller.destroy();
    controller.toggleAutoMode();
    clock.advance(5000);

    expect(battle.calls.length).toBe(since);
  });
});

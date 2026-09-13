import { describe, it, expect } from "vitest";
import {
  applyBattleTurnAction,
  projectBattleActionFeedback,
} from "../../src/core/phaseHandlers/battlePhaseHandler";
import { createTurnContext } from "../../src/battle/turnResolver";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import type { BattleState, Effect } from "../../src/battle/types";
import type { ActionSkillDefinition } from "../../src/shared/skillDefinitionTypes";
import type { Rng } from "../../src/shared/random";
import { coord } from "../battle/helpers/coords";
import { makeUnit } from "../battle/helpers/units";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { fixedRng } from "../battle/helpers/rng";
import { testStrike, testMagicBolt, testRevive } from "../battle/helpers/skills";

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

describe("applyBattleTurnAction — battle_use_skill", () => {
  it("ends the battle immediately when skill damage kills the last opposing unit", () => {
    const attacker = makeUnit({
      id:               "attacker",
      side:             "player",
      physicalStrength: 1000, // guaranteed kill
      skills:           [testStrike],
      activeSkillIndex: 0,
      dodge:            0,
      block:            0,
    });
    const enemy = makeUnit({
      id:    "enemy",
      side:  "enemy",
      hp:    1,
      maxHp: 100,
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits(
      {
        field: [
          { unit: attacker, anchor: coord("player", 0, 0) },
          { unit: enemy,    anchor: coord("enemy",  0, 0) },
        ],
      },
      { roundQueue: ["attacker", "enemy"] },
    );
    const context = createTurnContext();

    const result = applyBattleTurnAction({
      state,
      context,
      action: {
        type:   "battle_use_skill",
        unitId: "attacker",
        target: coord("enemy", 0, 0),
      },
      mode: "manual",
      rng:  fixedRng(0.99),
    });

    expect(result.state.phase).toBe("end");
    // Death is now a state transition, not deletion (Stage 2).
    expect(result.state.units.get("enemy")?.lifeState).toBe("dead");
    expect(result.state.units.get("enemy")?.hp).toBe(0);
  });

  it("advances the turn when the battle does not end after skill application", () => {
    const attacker = makeUnit({
      id:               "attacker",
      side:             "player",
      physicalStrength: 10, // not a kill
      skills:           [testStrike],
      activeSkillIndex: 0,
      dodge:            0,
      block:            0,
    });
    const enemy = makeUnit({
      id:    "enemy",
      side:  "enemy",
      hp:    100,
      maxHp: 100,
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits(
      {
        field: [
          { unit: attacker, anchor: coord("player", 0, 0) },
          { unit: enemy,    anchor: coord("enemy",  0, 0) },
        ],
      },
      { roundQueue: ["attacker", "enemy"] },
    );
    const context = createTurnContext();

    const result = applyBattleTurnAction({
      state,
      context,
      action: {
        type:   "battle_use_skill",
        unitId: "attacker",
        target: coord("enemy", 0, 0),
      },
      mode: "manual",
      rng:  fixedRng(0.99),
    });

    expect(result.state.phase).not.toBe("end");
    // battle_use_skill is a compound action: skill → game-over check → advance_turn.
    // After consuming attacker's slot, enemy is the only remaining unit.
    expect(result.state.roundQueue[0]).toBe("enemy");
    const enemyAfter = result.state.units.get("enemy");
    expect(enemyAfter).toBeDefined();
    expect(enemyAfter!.hp).toBeLessThan(100);
  });
});

describe("applyBattleTurnAction — battle_apply_auto_turn stale-intention guard", () => {
  it("rejects a stale auto-turn intention when the intended unit has died", () => {
    // Construct a state where the pending auto-turn intention points at a unit
    // that died in the 200 ms delay window between decide and apply.
    const actor = makeUnit({
      id:               "actor",
      side:             "enemy",
      physicalStrength: 10,
      skills:           [testStrike],
    });
    const player = makeUnit({ id: "player", side: "player", hp: 100, maxHp: 100 });

    let state = makeBattleStateFromUnits(
      {
        field: [
          { unit: actor,  anchor: coord("enemy",  0, 0) },
          { unit: player, anchor: coord("player", 0, 0) },
        ],
      },
      { roundQueue: ["actor", "player"] },
    );
    // The intention was decided when `actor` was alive; now `actor` is dead.
    state = setDead(state, "actor");

    const result = applyBattleTurnAction({
      state,
      context: createTurnContext(),
      action: { type: "battle_apply_auto_turn" },
      mode:   "auto",
      rng:    fixedRng(0.99),
      pendingAutoTurnIntention: {
        type:           "use_skill",
        unitId:         "actor",
        skillIndex:     0,
        target:         coord("player", 0, 0),
        activeUnitSide: "enemy",
      },
    });

    expect(result.autoTurnApplied).toBe(false);
    expect(result.events).toEqual([]);
    expect(result.state.units.get("player")?.hp).toBe(100); // skill never landed
  });
});

// ─── Targetless turns ─────────────────────────────────────────────────────────

/**
 * A back-row hero behind a living front-row guard: melee is blocked under the real targeting
 * rules. `heroSkills` decides whether any other skill of the hero has targets.
 */
function blockedHeroState(heroSkills: ActionSkillDefinition[] = [testStrike]): BattleState {
  const hero  = makeUnit({ id: "hero",  side: "player", skills: heroSkills });
  const guard = makeUnit({ id: "guard", side: "player" });
  const foe   = makeUnit({ id: "foe",   side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero,  anchor: coord("player", 1, 0) },
      { unit: guard, anchor: coord("player", 0, 0) },
      { unit: foe,   anchor: coord("enemy",  0, 0) },
    ],
  });
  return { ...state, roundQueue: ["hero", "guard", "foe"] };
}

/** Any RNG draw fails the test: waiting for input must consume no randomness. */
const FORBIDDEN_RNG: Rng = {
  next: () => { throw new Error("RNG must not be consumed"); },
};

describe("applyBattleTurnAction — battle_start_turn on a manual targetless turn", () => {
  it("waits for the player without any item resources", () => {
    const state  = blockedHeroState();
    const result = applyBattleTurnAction({
      state,
      context: createTurnContext(),
      action:  { type: "battle_start_turn" },
      mode:    "manual",
      rng:     FORBIDDEN_RNG,
    });

    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(result.events).toEqual([]);
    expect(result.winner).toBeUndefined();
    expect(result.state.roundQueue).toEqual(state.roundQueue);
  });

  it("projects detached public feedback carrying only the directive's public fields", () => {
    const result = applyBattleTurnAction({
      state:   blockedHeroState(),
      context: createTurnContext(),
      action:  { type: "battle_start_turn" },
      mode:    "manual",
      rng:     FORBIDDEN_RNG,
    });

    const feedback = projectBattleActionFeedback(result);
    expect(feedback.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(Object.keys(feedback.directive!)).toEqual(["type", "activeUnitId"]);
    expect(Object.keys(feedback)).toEqual(["events", "directive"]);
  });

  it("does not reach the manual branch in auto mode", () => {
    const result = applyBattleTurnAction({
      state:   blockedHeroState(),
      context: createTurnContext(),
      action:  { type: "battle_start_turn" },
      mode:    "auto",
      rng:     FORBIDDEN_RNG,
    });

    expect(result.directive).toEqual({
      type: "schedule_auto_turn", activeUnitId: "hero", delayKind: "auto_player",
    });
  });
});

describe("applyBattleTurnAction — automatic targetless turns complete exactly once", () => {
  it("prefers another skill with targets when the first has none", () => {
    const decided = applyBattleTurnAction({
      state:   blockedHeroState([testStrike, testMagicBolt]),
      context: createTurnContext(),
      action:  { type: "battle_decide_auto_turn" },
      mode:    "auto",
      rng:     fixedRng(0),
    });

    expect(decided.autoTurnDirective).toMatchObject({
      type: "intention",
      intention: { type: "use_skill", unitId: "hero", skillIndex: 1 },
    });
  });

  it("applies a blocked-melee skip by advancing the queue exactly one entry", () => {
    const state = blockedHeroState();
    const decided = applyBattleTurnAction({
      state, context: createTurnContext(),
      action: { type: "battle_decide_auto_turn" }, mode: "auto", rng: fixedRng(0),
    });
    expect(decided.autoTurnDirective).toMatchObject({
      type: "intention", intention: { type: "skip_turn", reason: "blocked_melee" },
    });

    const intention = decided.autoTurnDirective!.type === "intention"
      ? decided.autoTurnDirective!.intention
      : null;
    const applied = applyBattleTurnAction({
      state, context: createTurnContext(),
      action: { type: "battle_apply_auto_turn" }, mode: "auto", rng: fixedRng(0),
      pendingAutoTurnIntention: intention,
    });

    expect(applied.autoTurnApplied).toBe(true);
    expect(applied.events[0]).toMatchObject({ type: "turn_skipped", unitId: "hero", reason: "blocked_melee" });
    expect(applied.state.roundQueue).toEqual(["guard", "foe"]);
  });
});

describe("applyBattleTurnAction — battle_quick_turn with no executable action", () => {
  it("advances the queue exactly one entry and changes no HP", () => {
    // A revive with no fallen ally: no skill of the hero has a target.
    const state  = blockedHeroState([testStrike, testRevive]);
    const result = applyBattleTurnAction({
      state, context: createTurnContext(),
      action: { type: "battle_quick_turn", unitId: "hero" }, mode: "quick", rng: fixedRng(0),
    });

    expect(result.state.roundQueue).toEqual(["guard", "foe"]);
    for (const [id, unit] of state.units) {
      expect(result.state.units.get(id)!.hp).toBe(unit.hp);
    }
    expect(result.winner).toBeUndefined();
  });

  it("ticks round effects once at round end and reports a winner the tick produces", () => {
    const base = blockedHeroState([testStrike, testRevive]);
    const foe  = base.units.get("foe")!;
    const poisonedFoe = {
      ...foe,
      hp: 5,
      activeEffects: [{
        effectDisplayName: "poison",
        effect:            { id: "poison", durationKind: "rounds" } as unknown as Effect,
        remainingRounds:   3,
        periodicHp:        { direction: "damage" as const, amountPerTurn: 10 },
      }],
    };
    const units = new Map(base.units);
    units.set("foe", poisonedFoe);
    // The hero is the LAST entry of the round, so its advancement ends the round.
    const state: BattleState = {
      ...base, units, occupancy: buildOccupancy(units, base.deployments), roundQueue: ["hero"],
    };

    const result = applyBattleTurnAction({
      state, context: createTurnContext(),
      action: { type: "battle_quick_turn", unitId: "hero" }, mode: "quick", rng: fixedRng(0),
    });

    const tickEvents = result.events.filter(e => e.type === "effect_tick_damage");
    expect(tickEvents).toHaveLength(1);
    expect(result.state.units.get("foe")!.lifeState).toBe("dead");
    // `winner` carries the ELIMINATED side (checkGameOver), as consumed by showGameOver.
    expect(result.winner).toBe("enemy");
    expect(result.state.phase).toBe("end");
  });
});

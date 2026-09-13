import { describe, it, expect } from "vitest";
import { buildManualTurnPresentationInput } from "../../src/core/battleDirectiveProjection";
import { buildBattleDirectivePresentation } from "../../src/objects/battleDirectivePresentation";
import type { GamePhase } from "../../src/core/phases";
import type { FieldBattleUnitSnapshot } from "../../src/shared/battleSnapshots";
import type { ActionSkillDefinition } from "../../src/shared/skillDefinitionTypes";
import { SHAPES } from "../../src/data/shapeDefinitions";
import { makeBattlePhase } from "./helpers/phaseFixtures";
import { testStrike, testHeal, testRevive } from "../battle/helpers/skills";

/**
 * The one manual-turn presentation adapter. It reads committed render data only — the manual
 * control flag, the battle phase, the active unit and the committed valid targets — and never
 * resolves targets or items itself.
 */

type BattlePhase = Extract<GamePhase, { type: "battle" }>;

const neutralPair = (n: number) => ({ highlightBase: n, value: n });

function activeUnit(skill: ActionSkillDefinition, name = "Aria"): FieldBattleUnitSnapshot {
  return {
    id: "hero", side: "player", name, className: "C", currentHp: 100, maxHp: 100, lifeState: "alive",
    statDisplay: {
      level: 1,
      hp: neutralPair(100), maxHp: neutralPair(100),
      physicalStrength: neutralPair(0), magicalStrength: neutralPair(0),
      physicalDefense: neutralPair(0), magicalDefense: neutralPair(0),
      dodge: neutralPair(0), block: neutralPair(0), initiative: neutralPair(0),
    },
    shape: SHAPES["1x1"],
    deployment: { kind: "field", anchor: { side: "player", row: 0, col: 0 } },
    sprite: null,
    skills: [skill],
    activeSkillIndex: 0,
    activeEffects: [],
    rowTrait: "front",
    templateId: "t",
  };
}

/** A committed manual player turn in `select_target`; override one field per case. */
function manualPhase(overrides: Partial<BattlePhase> = {}): BattlePhase {
  const unit = activeUnit(testStrike);
  return makeBattlePhase({
    battlePhase:               "select_target",
    battleMode:                "manual",
    activeUnitId:              unit.id,
    activeUnit:                unit,
    activeUnitSide:            "player",
    manualTurnControlsVisible: true,
    activeUnitActions:         [],
    validTargets:              [{ side: "enemy", row: 0, col: 0 }],
    ...overrides,
  });
}

describe("buildManualTurnPresentationInput — guards", () => {
  it("returns none outside manual player control (auto mode or enemy side)", () => {
    expect(buildManualTurnPresentationInput(manualPhase({ manualTurnControlsVisible: false })))
      .toEqual({ type: "none" });
  });

  it("returns none during placement and after the battle ended", () => {
    expect(buildManualTurnPresentationInput(manualPhase({ battlePhase: "placement" })))
      .toEqual({ type: "none" });
    expect(buildManualTurnPresentationInput(manualPhase({ battlePhase: "end" })))
      .toEqual({ type: "none" });
  });

  it("returns none without an active unit", () => {
    expect(buildManualTurnPresentationInput(manualPhase({ activeUnit: null })))
      .toEqual({ type: "none" });
  });
});

describe("buildManualTurnPresentationInput — no committed targets", () => {
  it("asks for another action, for any skill policy", () => {
    for (const skill of [testStrike, testHeal, testRevive]) {
      const phase = manualPhase({ activeUnit: activeUnit(skill), validTargets: [] });
      expect(buildManualTurnPresentationInput(phase))
        .toEqual({ type: "await_manual_action", unitName: "Aria" });
    }
  });

  it("is worded as a general no-target message and keeps the action bar", () => {
    const input = buildManualTurnPresentationInput(manualPhase({ validTargets: [] }));

    expect(buildBattleDirectivePresentation(input)).toEqual({
      statusText:      "Aria — The selected skill has no valid targets. Choose another action.",
      displaySkillBar: true,
    });
  });
});

describe("buildManualTurnPresentationInput — committed targets exist", () => {
  const cases: ReadonlyArray<[string, ActionSkillDefinition, "attack" | "heal" | "revive"]> = [
    ["melee",  testStrike, "attack"],
    ["heal",   testHeal,   "heal"],
    ["revive", testRevive, "revive"],
  ];

  it.each(cases)("prompts for the %s target", (_name, skill, promptKind) => {
    const phase = manualPhase({ activeUnit: activeUnit(skill) });

    expect(buildManualTurnPresentationInput(phase))
      .toEqual({ type: "await_manual_target", promptKind, unitName: "Aria" });
    expect(buildBattleDirectivePresentation(buildManualTurnPresentationInput(phase)).displaySkillBar)
      .toBe(true);
  });
});

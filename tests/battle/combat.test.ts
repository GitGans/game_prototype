import { describe, it, expect } from "vitest";
import { resolveAttack, applyEffectBlock, applyVampirism } from "../../src/battle/combat";
import { cellKey } from "../../src/battle/field";
import type { Effect, ResolvedHitCell, SkillPattern } from "../../src/battle/types";
import { coord } from "./helpers/coords";
import { makeUnit } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";
import { fixedRng, sequenceRng } from "./helpers/rng";

// ─── resolveAttack ────────────────────────────────────────────────────────────

describe("resolveAttack", () => {
  it("deduplicates a multi-cell unit and applies only the highest damage hit", () => {
    const bigUnit = makeUnit({
      id: "big",
      shape: { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] }, // 1×2
      anchor: coord("enemy", 0, 0),
      physicalDefense: 0,
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits([bigUnit]);

    // Two hits on the same unit: multiplier 1.0 (40 dmg) and 0.5 (20 dmg)
    const hitCells: ResolvedHitCell[] = [
      { coord: coord("enemy", 0, 0), multiplier: 1.0 },
      { coord: coord("enemy", 0, 1), multiplier: 0.5 },
    ];

    const { events } = resolveAttack(
      hitCells,
      40,
      "physical",
      state,
      { rng: fixedRng(0.99) }, // 0.99*100=99, never < dodge/block threshold (capped at 90)
    );

    const hitEvents = events.filter((e) => e.type === "hit");
    expect(hitEvents).toHaveLength(1);
    // Only the highest-damage hit is applied (multiplier 1.0 → 40 dmg)
    expect(hitEvents[0]).toMatchObject({ unitId: "big", damage: 40 });
  });

  it("removes a dead unit from both units and occupancy", () => {
    const target = makeUnit({
      id: "dead-unit",
      hp: 10,
      maxHp: 10,
      anchor: coord("enemy", 0, 0),
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits([target]);
    const hitCells: ResolvedHitCell[] = [
      { coord: coord("enemy", 0, 0), multiplier: 1.0 },
    ];

    const { state: after } = resolveAttack(hitCells, 100, "physical", state, {
      rng: fixedRng(0.99),
    });

    expect(after.units.has("dead-unit")).toBe(false);
    expect(after.occupancy.cellToUnit.has(cellKey(coord("enemy", 0, 0)))).toBe(false);
  });

  it("dodges when RNG is below the dodge threshold", () => {
    // dodge=50 means: if rng()*100 < 50 → dodge.
    // fixedRng(0) → rng()*100 = 0 < 50 → dodge.
    const target = makeUnit({
      id: "dodger",
      dodge: 50,
      block: 0,
      anchor: coord("enemy", 0, 0),
    });
    const state = makeBattleStateFromUnits([target]);
    const hitCells: ResolvedHitCell[] = [
      { coord: coord("enemy", 0, 0), multiplier: 1.0 },
    ];

    const { events } = resolveAttack(hitCells, 50, "physical", state, {
      rng: fixedRng(0),
    });

    expect(events.find((e) => e.type === "dodged")).toBeTruthy();
    expect(events.find((e) => e.type === "hit")).toBeUndefined();
  });

  it("blocks when RNG is below the block threshold after a dodge miss", () => {
    // dodge=0, block=50.
    // sequenceRng([0.99, 0]): first call (dodge roll) → 0.99 → no dodge;
    //                       second call (block roll) → 0 → 0*100=0 < 50 → block.
    const target = makeUnit({
      id: "blocker",
      dodge: 0,
      block: 50,
      anchor: coord("enemy", 0, 0),
    });
    const state = makeBattleStateFromUnits([target]);
    const hitCells: ResolvedHitCell[] = [
      { coord: coord("enemy", 0, 0), multiplier: 1.0 },
    ];

    const { events } = resolveAttack(hitCells, 50, "physical", state, {
      rng: sequenceRng([0.99, 0]),
    });

    expect(events.find((e) => e.type === "blocked")).toBeTruthy();
    expect(events.find((e) => e.type === "hit")).toBeUndefined();
  });
});

// ─── applyEffectBlock ─────────────────────────────────────────────────────────

describe("applyEffectBlock", () => {
  function makeEffect(id: string): Effect {
    return { id, isBuff: false };
  }

  function makeEffectBlock(effectId: string) {
    return {
      effectMatrixName: "single",
      level: 1,
      effectDisplayName: "Test Effect",
      effectName: effectId,
      duration: 3,
      damageType: "physical" as const,
    };
  }

  const singleCellPattern: SkillPattern = {
    anchorRow: 0,
    anchorCol: 0,
    cells: [[{ damageMultiplier: 1 }]],
  };

  it("caps active effects at 2 and evicts the oldest when a third is added", () => {
    const effectA = makeEffect("effect-a");
    const effectB = makeEffect("effect-b");
    const target = makeUnit({
      id: "target",
      anchor: coord("enemy", 0, 0),
      activeEffects: [
        { effectDisplayName: "A", effect: effectA, remainingRounds: 2 },
        { effectDisplayName: "B", effect: effectB, remainingRounds: 2 },
      ],
    });
    const state = makeBattleStateFromUnits([target]);
    const effectC = makeEffect("effect-c");

    const { state: after } = applyEffectBlock(
      makeEffectBlock("effect-c"),
      singleCellPattern,
      coord("enemy", 0, 0),
      state,
      effectC,
    );

    const unit = after.units.get("target")!;
    expect(unit.activeEffects).toHaveLength(2);
    const ids = unit.activeEffects.map((ae) => ae.effect.id);
    // A was oldest → evicted; B and C remain
    expect(ids).not.toContain("effect-a");
    expect(ids).toContain("effect-b");
    expect(ids).toContain("effect-c");
  });

  it("replaces a duplicate effect (same effect.id) instead of stacking", () => {
    const effectA = makeEffect("effect-a");
    const target = makeUnit({
      id: "target",
      anchor: coord("enemy", 0, 0),
      activeEffects: [
        { effectDisplayName: "A", effect: effectA, remainingRounds: 1 },
      ],
    });
    const state = makeBattleStateFromUnits([target]);
    const refreshedA: Effect = { ...effectA }; // same id

    const { state: after } = applyEffectBlock(
      makeEffectBlock("effect-a"),
      singleCellPattern,
      coord("enemy", 0, 0),
      state,
      refreshedA,
    );

    const unit = after.units.get("target")!;
    expect(unit.activeEffects).toHaveLength(1);
    expect(unit.activeEffects[0].effect.id).toBe("effect-a");
  });
});

// ─── applyVampirism ───────────────────────────────────────────────────────────

describe("applyVampirism", () => {
  it("mass_vampirism does not heal any unit above maxHp", () => {
    const caster = makeUnit({ id: "caster", anchor: coord("player", 0, 0) });
    const ally = makeUnit({
      id: "ally",
      hp: 95,
      maxHp: 100,
      anchor: coord("player", 0, 1),
    });
    const state = makeBattleStateFromUnits([caster, ally]);

    const { state: after } = applyVampirism(
      { type: "mass_vampirism", level: 1 },
      caster,
      200,
      state,
    );

    for (const unit of after.units.values()) {
      expect(unit.hp).toBeLessThanOrEqual(unit.maxHp);
    }
  });
});

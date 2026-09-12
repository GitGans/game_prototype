import { describe, it, expect } from "vitest";
import { evaluateItemUsability } from "../../src/core/itemUsability";
import { useItem } from "../../src/core/itemUse";
import type { ItemUseInput } from "../../src/core/itemUse";
import type { ItemCatalog } from "../../src/shared/itemTypes";
import type { UnitBlueprint } from "../../src/shared/unitTypes";
import type { PlayerSessionState } from "../../src/core/playerSessionState";
import type { PlayerUnitState } from "../../src/progression";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { backpack, equipment, instance, catalog } from "../inventory/helpers";

const WARRIOR = PLAYER_UNITS.find(u => u.templateId === "warrior")!;
const BLUEPRINTS: readonly UnitBlueprint[] = [WARRIOR];

const HP_BOOST = { type: "permanent_stat_boost", stat: "hp", amount: 5 } as const;
const STR_BOOST = { type: "permanent_stat_boost", stat: "physicalStrength", amount: 2 } as const;

/** Ad-hoc ids that exist in no shipped catalog; `helm` carries the non-consumable coverage. */
const LOCAL_CATALOG: ItemCatalog = catalog({
  vitality: { kind: "consumable", slot: null, useEffect: HP_BOOST },
  might:    { kind: "consumable", slot: null, useEffect: STR_BOOST },
  elixir:   { kind: "consumable", slot: null, useEffect: { type: "heal", amount: 4 } },
  // A second, independently authored potion: it proves strength is data by running through the
  // same evaluator and executor with no code path of its own.
  draught:  { kind: "consumable", slot: null, useEffect: { type: "heal", amount: 40 } },
  // A USABLE potion: drinkable from the backpack on exactly the same terms as a consumable,
  // with a third independently authored amount. Kind decides placement, never the effect.
  flask:    { kind: "usable", slot: "usable_slot", useEffect: { type: "heal", amount: 7 } },
  // Unsupported-effect coverage moved here when `heal` became executable.
  scroll:   { kind: "consumable", slot: null, useEffect: { type: "revive" } },
  helm:     { kind: "equipment", slot: "helmet", battleStatBonuses: { hp: 100 } },
});

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1, isInCamp: false, lastPlacement: null,
    permanentBonuses: {}, chosenUpgrades: {},
    lifeState: "alive", currentHp: null,
    ...overrides,
  };
}

function session(overrides: {
  unit?: Partial<PlayerUnitState>;
  backpackSlots?: Record<string, string>;
  equipSlots?: Record<string, string>;
} = {}): PlayerSessionState {
  return {
    roster: { units: { warrior: unit(overrides.unit) } },
    inventory: {
      instances: {
        i_vitality: instance("i_vitality", "vitality"),
        i_might: instance("i_might", "might"),
        i_elixir: instance("i_elixir", "elixir"),
        i_draught: instance("i_draught", "draught"),
        i_scroll: instance("i_scroll", "scroll"),
        i_flask: instance("i_flask", "flask"),
        i_helm: instance("i_helm", "helm"),
      },
      containers: {
        backpack_shared: backpack("backpack_shared", overrides.backpackSlots ?? {
          "0": "i_vitality", "1": "i_might", "2": "i_elixir",
          "3": "i_draught", "4": "i_scroll", "5": "i_flask",
        }),
        equip_warrior: equipment("warrior", overrides.equipSlots ?? {}),
      },
    },
  };
}

function input(over: Partial<ItemUseInput> = {}): ItemUseInput {
  return {
    session: session(),
    catalog: LOCAL_CATALOG,
    playerBlueprints: BLUEPRINTS,
    unitTemplateId: "warrior",
    instanceId: "i_vitality",
    ...over,
  };
}

describe("useItem — success", () => {
  it("grants exactly one bonus and removes exactly one instance", () => {
    const before = session();
    const result = useItem(input({ session: before }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.permanentBonuses).toEqual({ hp: 5 });
    expect(Object.keys(result.nextSession.inventory.instances)).toHaveLength(
      Object.keys(before.inventory.instances).length - 1,
    );
    expect(result.nextSession.inventory.instances.i_vitality).toBeUndefined();

    const stillReferenced = Object.values(result.nextSession.inventory.containers).some(c =>
      Object.values(c.slots).includes("i_vitality"),
    );
    expect(stillReferenced).toBe(false);
  });

  it("heals current HP by the same amount for an HP boost", () => {
    const before = session({ unit: { currentHp: 3 } });
    const result = useItem(input({ session: before }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.currentHp).toBe(3 + 5);
  });

  it("leaves current HP alone for a non-HP boost", () => {
    const before = session({ unit: { currentHp: 3 } });
    const result = useItem(input({ session: before, instanceId: "i_might" }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.permanentBonuses).toEqual({ physicalStrength: 2 });
    expect(result.nextSession.roster.units.warrior.currentHp).toBe(3);
  });

  it("stacks across separate instances", () => {
    const first = useItem(input());
    if (!first.ok) throw new Error(first.reason);

    const inventory = first.nextSession.inventory;
    inventory.instances.i_vitality2 = instance("i_vitality2", "vitality");
    inventory.containers.backpack_shared.slots["5"] = "i_vitality2";

    const second = useItem(input({
      session: first.nextSession, instanceId: "i_vitality2",
    }));
    if (!second.ok) throw new Error(second.reason);

    expect(second.nextSession.roster.units.warrior.permanentBonuses).toEqual({ hp: 10 });
  });

  it("restores current HP without touching max HP or permanent bonuses", () => {
    const before = session({ unit: { currentHp: 100 } });
    const result = useItem(input({ session: before, instanceId: "i_elixir" }));
    if (!result.ok) throw new Error(result.reason);

    const after = result.nextSession.roster.units.warrior;
    expect(after.currentHp).toBe(104);
    // A heal is not growth: nothing permanent changes.
    expect(after.permanentBonuses).toEqual({});
    expect(after.level).toBe(1);
    expect(after.chosenUpgrades).toEqual({});
    expect(after.lifeState).toBe("alive");
  });

  it("clamps restoration to missing HP and stores a full result as null", () => {
    // 4-point potion on a unit missing only 2 HP (max 130).
    const before = session({ unit: { currentHp: 128 } });
    const result = useItem(input({ session: before, instanceId: "i_elixir" }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.currentHp).toBeNull();
  });

  it("runs a differently authored potion through the same path — strength is data", () => {
    const before = session({ unit: { currentHp: 50 } });
    const result = useItem(input({ session: before, instanceId: "i_draught" }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.currentHp).toBe(90);
    expect(result.nextSession.inventory.instances.i_draught).toBeUndefined();
  });

  it("drinks a USABLE potion from the backpack on the same terms as a consumable", () => {
    // Kind decides placement, never the effect: a usable in the shared backpack is drinkable,
    // and its authored amount runs through the same evaluator and executor.
    const before = session({ unit: { currentHp: 50 } });
    const result = useItem(input({ session: before, instanceId: "i_flask" }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.currentHp).toBe(57);
    expect(result.nextSession.inventory.instances.i_flask).toBeUndefined();
    // No permanent gain — a potion is not an essence.
    expect(result.nextSession.roster.units.warrior.permanentBonuses)
      .toEqual(before.roster.units.warrior.permanentBonuses);
  });

  it("cannot heal twice from one instance", () => {
    const before = session({ unit: { currentHp: 100 } });
    const first = useItem(input({ session: before, instanceId: "i_elixir" }));
    if (!first.ok) throw new Error(first.reason);

    expect(useItem(input({ session: first.nextSession, instanceId: "i_elixir" })))
      .toEqual({ ok: false, reason: "missing_instance" });
  });

  it("never mutates the input session", () => {
    const before = session();
    const snapshot = JSON.parse(JSON.stringify(before));

    useItem(input({ session: before }));

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });
});

describe("useItem — an unknown definition is rejected before anything is resolved", () => {
  it("refuses an id the supplied catalog does not define", () => {
    // LOCAL_CATALOG's ad-hoc ids do not exist in the shipped catalog, so location
    // validation refuses the use before any stat or heal arithmetic runs.
    // Catalog-dependent max HP is covered in tests/core/itemHealingMaxHp.test.ts.
    const before = session({ unit: { currentHp: 1 } });

    expect(useItem(input({ session: before, catalog: ITEM_CATALOG })))
      .toEqual({ ok: false, reason: "missing_definition" });
    expect(before.inventory.instances.i_vitality).toBeDefined();
  });
});

describe("useItem — failures leave both domains untouched", () => {
  const cases: Array<[string, Partial<ItemUseInput>, string]> = [
    ["a missing instance", { instanceId: "nope" }, "missing_instance"],
    ["an unimplemented effect", { instanceId: "i_scroll" }, "unsupported_effect"],
    ["an unknown character", { unitTemplateId: "ghost" }, "unit_not_found"],
    ["an item held in no container", { instanceId: "i_helm" }, "not_usable_from_here"],
  ];

  it.each(cases)("reports %s and writes nothing", (_label, over, reason) => {
    const before = session();
    const snapshot = JSON.parse(JSON.stringify(before));

    expect(useItem(input({ session: before, ...over })))
      .toEqual({ ok: false, reason });
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });

  it("rejects a dead character without consuming the item", () => {
    const before = session({ unit: { lifeState: "dead", currentHp: 0 } });

    expect(useItem(input({ session: before })))
      .toEqual({ ok: false, reason: "unit_dead" });
    expect(before.inventory.instances.i_vitality).toBeDefined();
  });

  it("rejects a heal on a full-health character without consuming the potion", () => {
    // currentHp: null IS full health — the stored form must be recognized, not just a number.
    for (const currentHp of [null, 130]) {
      const before = session({ unit: { currentHp } });

      expect(useItem(input({ session: before, instanceId: "i_elixir" })))
        .toEqual({ ok: false, reason: "unit_full_hp" });
      expect(before.inventory.instances.i_elixir).toBeDefined();
    }
  });

  it("still allows a permanent stat boost at full health — the rule is heal-specific", () => {
    const before = session({ unit: { currentHp: null } });
    const result = useItem(input({ session: before }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.permanentBonuses).toEqual({ hp: 5 });
  });

  it("rejects a heal on a dead character without consuming the potion", () => {
    const before = session({ unit: { lifeState: "dead", currentHp: 0 } });

    expect(useItem(input({ session: before, instanceId: "i_elixir" })))
      .toEqual({ ok: false, reason: "unit_dead" });
    expect(before.inventory.instances.i_elixir).toBeDefined();
  });

  it("rejects a blueprint-less character", () => {
    const before: PlayerSessionState = {
      ...session(),
      roster: { units: { ...session().roster.units, ghost: unit() } },
    };

    expect(useItem(input({ session: before, unitTemplateId: "ghost" })))
      .toEqual({ ok: false, reason: "blueprint_not_found" });
  });

  it("rejects an equipped consumable", () => {
    const before = session({
      backpackSlots: {}, equipSlots: { helmet: "i_vitality" },
    });

    expect(useItem(input({ session: before })))
      .toEqual({ ok: false, reason: "not_in_backpack" });
  });
});

describe("evaluateItemUsability agrees with the executor", () => {
  const scenarios: Array<[string, Partial<ItemUseInput>]> = [
    ["an eligible HP boost", {}],
    ["an eligible non-HP boost", { instanceId: "i_might" }],
    ["an eligible heal", { instanceId: "i_elixir", session: session({ unit: { currentHp: 1 } }) }],
    ["a heal on a full-health target", { instanceId: "i_elixir" }],
    ["an unimplemented effect", { instanceId: "i_scroll" }],
    ["a missing instance", { instanceId: "nope" }],
    ["an unknown character", { unitTemplateId: "ghost" }],
  ];

  it.each(scenarios)("matches on %s", (_label, over) => {
    const shared = input(over);
    const usability = evaluateItemUsability(shared);
    const executed = useItem(shared);

    expect(usability.canUse).toBe(executed.ok);
    if (!usability.canUse && !executed.ok) {
      expect(usability.reason).toBe(executed.reason);
    }
  });

  it("reports the effect the executor will apply", () => {
    const usability = evaluateItemUsability(input());
    if (!usability.canUse) throw new Error(usability.reason);

    expect(usability.effect).toEqual({
      type: "permanent_stat_boost", stat: "hp", amount: 5, healsCurrentHp: true,
    });
  });

  it("marks a non-HP boost as not healing", () => {
    const usability = evaluateItemUsability(input({ instanceId: "i_might" }));
    if (!usability.canUse) throw new Error(usability.reason);
    if (usability.effect.type !== "permanent_stat_boost") throw new Error("expected a boost");

    expect(usability.effect.healsCurrentHp).toBe(false);
  });

  it("reports the CLAMPED restoration a heal will actually apply", () => {
    // Warrior max HP is 130 at level 1; at 128 a 4-point potion restores only 2.
    const wounded = session({ unit: { currentHp: 128 } });
    const usability = evaluateItemUsability(
      input({ session: wounded, instanceId: "i_elixir" }),
    );
    if (!usability.canUse) throw new Error(usability.reason);
    if (usability.effect.type !== "heal") throw new Error("expected a heal");

    expect(usability.effect.amount).toBe(4);
    expect(usability.effect.restoredHp).toBe(2);
    expect(usability.effect.currentHp).toBe(128);
    expect(usability.effect.maxHp).toBe(130);

    const executed = useItem(input({ session: wounded, instanceId: "i_elixir" }));
    if (!executed.ok) throw new Error(executed.reason);
    // The preview and the executed result describe the same use.
    expect(executed.nextSession.roster.units.warrior.currentHp).toBeNull();
  });
});

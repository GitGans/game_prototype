import { describe, it, expect } from "vitest";
import { evaluateConsumableUsability } from "../../src/core/consumableUsability";
import { useConsumableItem } from "../../src/core/consumableUse";
import type { ConsumableUseInput } from "../../src/core/consumableUse";
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

/** A catalog whose helmet grants +100 HP — used to prove the SUPPLIED catalog is the one read. */
const LOCAL_CATALOG: ItemCatalog = catalog({
  vitality: { kind: "consumable", slot: null, useEffect: HP_BOOST },
  might:    { kind: "consumable", slot: null, useEffect: STR_BOOST },
  elixir:   { kind: "consumable", slot: null, useEffect: { type: "heal", amount: 4 } },
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
        i_helm: instance("i_helm", "helm"),
      },
      containers: {
        backpack_shared: backpack("backpack_shared", overrides.backpackSlots ?? {
          "0": "i_vitality", "1": "i_might", "2": "i_elixir",
        }),
        equip_warrior: equipment("warrior", overrides.equipSlots ?? {}),
      },
    },
  };
}

function input(over: Partial<ConsumableUseInput> = {}): ConsumableUseInput {
  return {
    session: session(),
    catalog: LOCAL_CATALOG,
    playerBlueprints: BLUEPRINTS,
    unitTemplateId: "warrior",
    instanceId: "i_vitality",
    ...over,
  };
}

describe("useConsumableItem — success", () => {
  it("grants exactly one bonus and removes exactly one instance", () => {
    const before = session();
    const result = useConsumableItem(input({ session: before }));
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
    const result = useConsumableItem(input({ session: before }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.currentHp).toBe(3 + 5);
  });

  it("leaves current HP alone for a non-HP boost", () => {
    const before = session({ unit: { currentHp: 3 } });
    const result = useConsumableItem(input({ session: before, instanceId: "i_might" }));
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextSession.roster.units.warrior.permanentBonuses).toEqual({ physicalStrength: 2 });
    expect(result.nextSession.roster.units.warrior.currentHp).toBe(3);
  });

  it("stacks across separate instances", () => {
    const first = useConsumableItem(input());
    if (!first.ok) throw new Error(first.reason);

    const inventory = first.nextSession.inventory;
    inventory.instances.i_vitality2 = instance("i_vitality2", "vitality");
    inventory.containers.backpack_shared.slots["5"] = "i_vitality2";

    const second = useConsumableItem(input({
      session: first.nextSession, instanceId: "i_vitality2",
    }));
    if (!second.ok) throw new Error(second.reason);

    expect(second.nextSession.roster.units.warrior.permanentBonuses).toEqual({ hp: 10 });
  });

  it("never mutates the input session", () => {
    const before = session();
    const snapshot = JSON.parse(JSON.stringify(before));

    useConsumableItem(input({ session: before }));

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });
});

describe("useConsumableItem — the supplied catalog is authoritative", () => {
  it("resolves max HP from the supplied catalog, not the global ITEM_DEFINITIONS", () => {
    // The helmet is equipped and grants +100 HP in LOCAL_CATALOG. If the global catalog were
    // consulted instead, the id would be unknown, max HP would be 100 lower, and a wounded unit
    // would be healed to a different value.
    const wounded = session({ unit: { currentHp: 1 }, equipSlots: { helmet: "i_helm" } });

    const local = useConsumableItem(input({ session: wounded }));
    if (!local.ok) throw new Error(local.reason);
    expect(local.nextSession.roster.units.warrior.currentHp).toBe(6);

    // Against the real global catalog the same instance is not a known definition at all.
    const globalRun = useConsumableItem(input({ session: wounded, catalog: ITEM_CATALOG }));
    expect(globalRun).toEqual({ ok: false, reason: "missing_definition" });
  });
});

describe("useConsumableItem — failures leave both domains untouched", () => {
  const cases: Array<[string, Partial<ConsumableUseInput>, string]> = [
    ["a missing instance", { instanceId: "nope" }, "missing_instance"],
    ["an unimplemented effect", { instanceId: "i_elixir" }, "unsupported_effect"],
    ["an unknown character", { unitTemplateId: "ghost" }, "unit_not_found"],
    ["an item held in no container", { instanceId: "i_helm" }, "not_consumable"],
  ];

  it.each(cases)("reports %s and writes nothing", (_label, over, reason) => {
    const before = session();
    const snapshot = JSON.parse(JSON.stringify(before));

    expect(useConsumableItem(input({ session: before, ...over })))
      .toEqual({ ok: false, reason });
    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
  });

  it("rejects a dead character without consuming the item", () => {
    const before = session({ unit: { lifeState: "dead", currentHp: 0 } });

    expect(useConsumableItem(input({ session: before })))
      .toEqual({ ok: false, reason: "unit_dead" });
    expect(before.inventory.instances.i_vitality).toBeDefined();
  });

  it("rejects a blueprint-less character", () => {
    const before: PlayerSessionState = {
      ...session(),
      roster: { units: { ...session().roster.units, ghost: unit() } },
    };

    expect(useConsumableItem(input({ session: before, unitTemplateId: "ghost" })))
      .toEqual({ ok: false, reason: "blueprint_not_found" });
  });

  it("rejects an equipped consumable", () => {
    const before = session({
      backpackSlots: {}, equipSlots: { helmet: "i_vitality" },
    });

    expect(useConsumableItem(input({ session: before })))
      .toEqual({ ok: false, reason: "not_in_backpack" });
  });
});

describe("evaluateConsumableUsability agrees with the executor", () => {
  const scenarios: Array<[string, Partial<ConsumableUseInput>]> = [
    ["an eligible HP boost", {}],
    ["an eligible non-HP boost", { instanceId: "i_might" }],
    ["an unimplemented effect", { instanceId: "i_elixir" }],
    ["a missing instance", { instanceId: "nope" }],
    ["an unknown character", { unitTemplateId: "ghost" }],
  ];

  it.each(scenarios)("matches on %s", (_label, over) => {
    const shared = input(over);
    const usability = evaluateConsumableUsability(shared);
    const executed = useConsumableItem(shared);

    expect(usability.canUse).toBe(executed.ok);
    if (!usability.canUse && !executed.ok) {
      expect(usability.reason).toBe(executed.reason);
    }
  });

  it("reports the effect the executor will apply", () => {
    const usability = evaluateConsumableUsability(input());
    if (!usability.canUse) throw new Error(usability.reason);

    expect(usability.effect).toEqual({ stat: "hp", amount: 5, healsCurrentHp: true });
  });

  it("marks a non-HP boost as not healing", () => {
    const usability = evaluateConsumableUsability(input({ instanceId: "i_might" }));
    if (!usability.canUse) throw new Error(usability.reason);

    expect(usability.effect.healsCurrentHp).toBe(false);
  });
});

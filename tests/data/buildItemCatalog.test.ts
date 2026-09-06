import { describe, it, expect } from "vitest";
import { buildItemCatalog } from "../../src/data/items/buildItemCatalog";
import type { ItemGroup } from "../../src/data/items/authoredItemTypes";
import { ITEM_CATALOG } from "../../src/data/items";
import { UNIT_BATTLE_STAT_KEYS } from "../../src/shared/unitTypes";

describe("buildItemCatalog", () => {
  it("derives the item id from the object key", () => {
    const groups: ItemGroup[] = [
      { kind: "equipment", slot: "helmet", items: { steel_helm: { name: "Steel Helm", buyPrice: 10 } } },
    ];
    const { definitions } = buildItemCatalog(groups);
    expect(definitions.steel_helm.id).toBe("steel_helm");
  });

  it("zero-fills partial battleStatBonuses into a full object", () => {
    const groups: ItemGroup[] = [
      { kind: "equipment", slot: "ring", items: { r: { name: "R", buyPrice: 1, battleStatBonuses: { hp: 5 } } } },
    ];
    const { definitions } = buildItemCatalog(groups);
    expect(definitions.r.battleStatBonuses).toEqual({
      hp: 5, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
      dodge: 0, block: 0, initiative: 0,
    });
  });

  it("generates metadata kind + slot from the group (equipment)", () => {
    const groups: ItemGroup[] = [
      { kind: "equipment", slot: "boots", items: { b: { name: "B", buyPrice: 1 } } },
    ];
    const { metadataById } = buildItemCatalog(groups);
    expect(metadataById.b).toEqual({ kind: "equipment", slot: "boots" });
  });

  it("generates metadata kind + usable_slot for a usable group", () => {
    const groups: ItemGroup[] = [
      { kind: "usable", slot: "usable_slot", items: { jar: { name: "Jar", buyPrice: 1, useEffect: { type: "heal", amount: 5 } } } },
    ];
    const { metadataById } = buildItemCatalog(groups);
    expect(metadataById.jar).toEqual({ kind: "usable", slot: "usable_slot" });
  });

  it("generates slot: null for a consumable group", () => {
    const groups: ItemGroup[] = [
      { kind: "consumable", items: { essence: { name: "E", buyPrice: 1, useEffect: { type: "permanent_stat_boost", stat: "hp", amount: 5 } } } },
    ];
    const { metadataById } = buildItemCatalog(groups);
    expect(metadataById.essence).toEqual({ kind: "consumable", slot: null });
  });

  it("throws on duplicate item ids across groups", () => {
    const groups: ItemGroup[] = [
      { kind: "equipment", slot: "helmet", items: { dup: { name: "A", buyPrice: 1 } } },
      { kind: "equipment", slot: "boots", items: { dup: { name: "B", buyPrice: 1 } } },
    ];
    expect(() => buildItemCatalog(groups)).toThrow(/Duplicate item id/);
  });

  it("throws when a usable item is missing its useEffect", () => {
    const groups: ItemGroup[] = [
      { kind: "usable", slot: "usable_slot", items: { broken: { name: "X", buyPrice: 1 } } },
    ];
    expect(() => buildItemCatalog(groups)).toThrow(/requires a useEffect/);
  });

  it("throws when a permanent_stat_boost names a stat outside the canonical battle stats", () => {
    const groups = [
      { kind: "consumable", items: { bad: {
        name: "Bad", buyPrice: 1,
        useEffect: { type: "permanent_stat_boost", stat: "luck", amount: 5 },
      } } },
    ] as unknown as ItemGroup[];

    expect(() => buildItemCatalog(groups)).toThrow(/unknown battle stat "luck"/);
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws when a permanent_stat_boost amount is not finite and positive (%s)",
    (amount) => {
      const groups: ItemGroup[] = [
        { kind: "consumable", items: { bad: {
          name: "Bad", buyPrice: 1,
          useEffect: { type: "permanent_stat_boost", stat: "hp", amount },
        } } },
      ];

      expect(() => buildItemCatalog(groups)).toThrow(/finite amount > 0/);
    },
  );

  it("accepts a valid permanent_stat_boost for every canonical stat", () => {
    // No item id and no particular amount is privileged: the rule is generic.
    const groups: ItemGroup[] = UNIT_BATTLE_STAT_KEYS.map((stat, i) => ({
      kind: "consumable",
      items: { [`e_${stat}`]: {
        name: stat, buyPrice: 1,
        useEffect: { type: "permanent_stat_boost", stat, amount: i + 1 },
      } },
    }));

    const { definitions } = buildItemCatalog(groups);
    expect(Object.keys(definitions)).toHaveLength(UNIT_BATTLE_STAT_KEYS.length);
  });

  it("leaves heal and revive effects unvalidated — they carry no mechanics yet", () => {
    const groups: ItemGroup[] = [
      { kind: "consumable", items: {
        h: { name: "H", buyPrice: 1, useEffect: { type: "heal", amount: 3 } },
        r: { name: "R", buyPrice: 1, useEffect: { type: "revive" } },
      } },
    ];

    expect(() => buildItemCatalog(groups)).not.toThrow();
  });

  it("throws when a consumable item is missing its useEffect", () => {
    const groups: ItemGroup[] = [
      { kind: "consumable", items: { broken: { name: "X", buyPrice: 1 } } },
    ];
    expect(() => buildItemCatalog(groups)).toThrow(/requires a useEffect/);
  });

  it("throws when an equipment item carries a useEffect (behavior-ownership guard)", () => {
    const groups: ItemGroup[] = [
      { kind: "equipment", slot: "helmet", items: { weird: { name: "X", buyPrice: 1, useEffect: { type: "heal", amount: 1 } } } },
    ];
    expect(() => buildItemCatalog(groups)).toThrow(/must not have a useEffect/);
  });

  it("throws when a usable group uses a slot other than usable_slot (usable_slot ownership)", () => {
    // Bypasses the literal type via a malformed JS group — the builder must still reject it.
    const groups = [
      { kind: "usable", slot: "helmet", items: { x: { name: "X", buyPrice: 1, useEffect: { type: "heal", amount: 1 } } } },
    ] as unknown as ItemGroup[];
    expect(() => buildItemCatalog(groups)).toThrow(/must use slot 'usable_slot'/);
  });

  it("throws when an equipment group uses usable_slot (usable_slot is reserved for kind 'usable')", () => {
    const groups = [
      { kind: "equipment", slot: "usable_slot", items: { x: { name: "X", buyPrice: 1 } } },
    ] as unknown as ItemGroup[];
    expect(() => buildItemCatalog(groups)).toThrow(/must not use slot 'usable_slot'/);
  });

  it("generated definitions never carry usage or equipSlot", () => {
    for (const def of Object.values(ITEM_CATALOG.definitions)) {
      expect(def).not.toHaveProperty("usage");
      expect(def).not.toHaveProperty("equipSlot");
    }
  });

  it("the real catalog builds and every definition has matching metadata", () => {
    const ids = Object.keys(ITEM_CATALOG.definitions);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(ITEM_CATALOG.metadataById[id]).toBeDefined();
    }
  });
});

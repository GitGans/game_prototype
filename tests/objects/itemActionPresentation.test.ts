import { describe, it, expect } from "vitest";
import type { ItemEquipFailure, ItemUseFailure } from "../../src/shared/itemTypes";
import type { ItemActionMenuSnapshot } from "../../src/shared/snapshotTypes";
import {
  buildItemActionOptions,
  formatItemActionTitle,
  formatItemActionBody,
} from "../../src/objects/itemActionPresentation";

/**
 * Compile-time exhaustiveness pins: adding a failure member without wording is a type error
 * here, not a blank line in the window.
 */
const ALL_USE_REASONS: ItemUseFailure[] = [
  "missing_instance", "missing_definition", "not_usable_from_here", "missing_use_effect",
  "not_in_backpack", "not_equipped_by_unit", "duplicate_placement",
  "unit_dead", "invalid_amount", "invalid_result", "unit_full_hp",
  "unit_not_found", "blueprint_not_found", "unsupported_effect",
];

const ALL_EQUIP_REASONS: ItemEquipFailure[] = [
  "missing_instance", "missing_definition", "not_equippable", "class_restricted",
  "missing_equip_container", "missing_location", "missing_equipped_instance", "invalid_swap",
];

function menu(overrides: Partial<ItemActionMenuSnapshot> = {}): ItemActionMenuSnapshot {
  return {
    instanceId: "i_potion",
    unitTemplateId: "warrior",
    unitName: "Warrior",
    itemName: "Small Healing Potion",
    effect: { type: "heal", amount: 10 },
    options: [
      { action: "use", enabled: true, disabledReason: null },
      { action: "equip", enabled: true, disabledReason: null },
    ],
    ...overrides,
  };
}

describe("itemActionPresentation", () => {
  it("labels the two actions and keeps the snapshot's order", () => {
    expect(buildItemActionOptions(menu()).map(o => [o.action, o.label]))
      .toEqual([["use", "Use"], ["equip", "Equip"]]);

    const reversed = menu({ options: [
      { action: "equip", enabled: true, disabledReason: null },
      { action: "use", enabled: true, disabledReason: null },
    ] });
    expect(buildItemActionOptions(reversed).map(o => o.action)).toEqual(["equip", "use"]);
  });

  it("COPIES enabled through rather than deriving it", () => {
    // The point of the module boundary: eligibility is decided by the read model and must not
    // migrate into wording. A disabled option with no reason stays disabled regardless.
    const options = buildItemActionOptions(menu({ options: [
      { action: "use", enabled: false, disabledReason: "unit_full_hp" },
      { action: "equip", enabled: true, disabledReason: null },
    ] }));

    expect(options.map(o => o.enabled)).toEqual([false, true]);
    expect(options[0].disabledExplanation).toBe(
      "Cannot use: this character is already at full HP.",
    );
    expect(options[1].disabledExplanation).toBeNull();
  });

  it("gives an enabled option no explanation even if the snapshot carries a reason", () => {
    const [option] = buildItemActionOptions(menu({ options: [
      { action: "use", enabled: true, disabledReason: "unit_dead" },
    ] }));

    expect(option.enabled).toBe(true);
    expect(option.disabledExplanation).toBeNull();
  });

  it("words shared reason names differently for Use and Equip", () => {
    // `missing_instance` exists in both vocabularies; the ACTION selects the table, because the
    // reason alone would be ambiguous.
    const [use] = buildItemActionOptions(menu({ options: [
      { action: "use", enabled: false, disabledReason: "missing_instance" },
    ] }));
    const [equip] = buildItemActionOptions(menu({ options: [
      { action: "equip", enabled: false, disabledReason: "missing_instance" },
    ] }));

    expect(use.disabledExplanation).toMatch(/^Cannot use:/);
    expect(equip.disabledExplanation).toMatch(/^Cannot equip:/);
  });

  it("has non-empty wording for every reason in both vocabularies", () => {
    for (const reason of ALL_USE_REASONS) {
      const [option] = buildItemActionOptions(menu({ options: [
        { action: "use", enabled: false, disabledReason: reason },
      ] }));
      expect(option.disabledExplanation).toBeTruthy();
    }
    for (const reason of ALL_EQUIP_REASONS) {
      const [option] = buildItemActionOptions(menu({ options: [
        { action: "equip", enabled: false, disabledReason: reason },
      ] }));
      expect(option.disabledExplanation).toBeTruthy();
    }
  });

  it("titles the window with the item and its target", () => {
    expect(formatItemActionTitle(menu())).toBe("Small Healing Potion — Warrior");
  });

  it("describes the effect target-independently, and omits it when there is none", () => {
    // Same wording as the backpack tooltip: the nominal ceiling, not this target's restoration.
    expect(formatItemActionBody(menu())).toBe("Restores up to 10 HP.");
    expect(formatItemActionBody(menu({ effect: null }))).toBeNull();
    expect(formatItemActionBody(menu({ effect: { type: "revive" } }))).toBeNull();
  });
});

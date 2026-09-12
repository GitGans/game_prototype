import { describe, it, expect } from "vitest";
import { evaluateItemUsability } from "../../src/core/itemUsability";
import { useItem } from "../../src/core/itemUse";
import type { ItemUseInput } from "../../src/core/itemUse";
import type { ItemCatalog } from "../../src/shared/itemTypes";
import type { UnitBlueprint, UnitUpgradeOption } from "../../src/shared/unitTypes";
import type { PlayerSessionState } from "../../src/core/playerSessionState";
import type { PlayerUnitState } from "../../src/progression";
import { PLAYER_UNITS } from "../../src/data/units";
import { opt } from "../../src/data/units/upgradeOptionHelpers";
import { sid } from "../../src/data/skills/skillDefinitions";
import { backpack, equipment, instance, catalog } from "../inventory/helpers";

// ---------------------------------------------------------------------------
// A heal is clamped to (maxHp - currentHp), so every result below depends on max
// HP being resolved from level growth + selected upgrades + equipped items read
// from the SUPPLIED catalog + permanent bonuses. Each case is deliberately near
// full health, so a wrong max HP changes the restored amount and fails the test.
//
// Every expected number here is authored by hand, never produced by the resolver
// under test.
// ---------------------------------------------------------------------------

/** Round base HP so each contribution is readable in the expectations. */
const BASE_HP = 100;

/**
 * Level-5 base HP for BASE_HP under the shipped growth curve
 * (progression/stats/unitBaseStats.ts: +10/+10/+10/+12 % => round(100 * 1.42)).
 * If the curve is deliberately changed, this constant is the single edit site.
 */
const LEVEL_5_BASE_HP = 142;

const UPGRADE_HP = 20;
const POTION_AMOUNT = 10;

/** The shipped warrior options carry no statModifiers, so the HP upgrade is authored here. */
const HP_UPGRADE: UnitUpgradeOption = opt(
  "warrior_5_row_strike",
  "Row Strike (+20 HP)",
  sid("row_strike"),
  { statModifiers: { hp: UPGRADE_HP } },
);

const SHIPPED_WARRIOR = PLAYER_UNITS.find(u => u.templateId === "warrior")!;

/**
 * A local blueprint: round base HP and exactly one upgrade tier.
 * upgradeTiers MUST be replaced, not inherited — the shipped tiers contribute no HP,
 * which would silently turn the "selected upgrade" case into the level-only case.
 */
const WARRIOR: UnitBlueprint = {
  ...SHIPPED_WARRIOR,
  hp: BASE_HP,
  upgradeTiers: [{ unlocksAtLevel: 5, options: [HP_UPGRADE] }],
};

const BLUEPRINTS: readonly UnitBlueprint[] = [WARRIOR];

/** Two ids only; both are always defined, so no branch can end at missing_definition. */
function healingCatalog(equippedHpBonus: number): ItemCatalog {
  return catalog({
    potion: { kind: "consumable", slot: null, useEffect: { type: "heal", amount: POTION_AMOUNT } },
    amulet: { kind: "equipment", slot: "necklace", battleStatBonuses: { hp: equippedHpBonus } },
  });
}

/** A bystander with no blueprint: healing must not rewrite the rest of the roster. */
const BYSTANDER: PlayerUnitState = {
  level: 3, isInCamp: true, lastPlacement: null,
  permanentBonuses: { hp: 4 }, chosenUpgrades: {},
  lifeState: "alive", currentHp: 12,
};

interface Fixture {
  level?: number;
  /** true: amulet worn in `necklace`. false: amulet sits in the shared backpack. */
  equipped?: boolean;
  /** true: the tier option is stored in chosenUpgrades. false: offered but unselected. */
  upgradeSelected?: boolean;
  permanentHp?: number;
  currentHp: number | null;
}

function makeSession(f: Fixture): PlayerSessionState {
  const equipped = f.equipped ?? false;
  return {
    roster: {
      units: {
        warrior: {
          level: f.level ?? 1,
          isInCamp: false,
          lastPlacement: null,
          permanentBonuses: f.permanentHp ? { hp: f.permanentHp } : {},
          chosenUpgrades: f.upgradeSelected ? { 5: HP_UPGRADE.id } : {},
          lifeState: "alive",
          currentHp: f.currentHp,
        },
        bystander: BYSTANDER,
      },
    },
    inventory: {
      instances: {
        i_potion: instance("i_potion", "potion"),
        i_amulet: instance("i_amulet", "amulet"),
      },
      containers: {
        // Exactly one placement per instance — more would trip duplicate_placement.
        backpack_shared: backpack(
          "backpack_shared",
          equipped ? { "0": "i_potion" } : { "0": "i_potion", "1": "i_amulet" },
        ),
        equip_warrior: equipment("warrior", equipped ? { necklace: "i_amulet" } : {}),
      },
    },
  };
}

function useInput(session: PlayerSessionState, itemCatalog: ItemCatalog): ItemUseInput {
  return {
    session,
    catalog: itemCatalog,
    playerBlueprints: BLUEPRINTS,
    unitTemplateId: "warrior",
    instanceId: "i_potion",
  };
}

interface Expected {
  maxHp: number;
  currentHp: number;
  restoredHp: number;
  /** null means "healed to full", per the roster HP invariant. */
  storedHp: number | null;
}

/**
 * Runs preview + execution over the same input and asserts the whole contract:
 * the reported cap, the clamped restoration, the stored result, and that nothing
 * else in either domain moved. The caller's session must survive both calls.
 */
function expectHeal(session: PlayerSessionState, itemCatalog: ItemCatalog, expected: Expected): void {
  const snapshot = structuredClone(session);
  const shared = useInput(session, itemCatalog);

  const usability = evaluateItemUsability(shared);
  if (!usability.canUse) throw new Error(usability.reason);
  expect(usability.effect).toEqual({
    type: "heal",
    amount: POTION_AMOUNT,           // the authored amount, unclamped
    restoredHp: expected.restoredHp, // what will actually be restored
    currentHp: expected.currentHp,
    maxHp: expected.maxHp,
  });

  const executed = useItem(shared);
  if (!executed.ok) throw new Error(executed.reason);

  const before = snapshot.roster.units.warrior;
  const after = executed.nextSession.roster.units.warrior;
  expect(after.currentHp).toBe(expected.storedHp);
  // A heal is not growth: no source of max HP may change.
  expect(after.level).toBe(before.level);
  expect(after.permanentBonuses).toEqual(before.permanentBonuses);
  expect(after.chosenUpgrades).toEqual(before.chosenUpgrades);
  expect(after.lifeState).toBe("alive");
  expect(executed.nextSession.roster.units.bystander).toEqual(snapshot.roster.units.bystander);

  const next = executed.nextSession.inventory;
  expect(next.instances.i_potion).toBeUndefined();
  expect(
    Object.values(next.containers).some(c => Object.values(c.slots).includes("i_potion")),
  ).toBe(false);
  // Equipment is untouched: only the potion is consumed.
  expect(next.instances.i_amulet).toBeDefined();
  expect(next.containers.equip_warrior.slots).toEqual(
    snapshot.inventory.containers.equip_warrior.slots,
  );

  expect(session).toEqual(snapshot);
}

// ---------------------------------------------------------------------------

describe("healing resolves max HP from every contributing source", () => {
  const cases: Array<[string, number, Fixture, Expected]> = [
    ["an equipped item bonus", 30,
      { level: 1, equipped: true, currentHp: 127 },
      { maxHp: 130, currentHp: 127, restoredHp: 3, storedHp: null }],

    ["a selected upgrade", 0,
      { level: 5, upgradeSelected: true, currentHp: 159 },
      { maxHp: LEVEL_5_BASE_HP + UPGRADE_HP, currentHp: 159, restoredHp: 3, storedHp: null }],

    ["a permanent bonus", 0,
      { level: 1, permanentHp: 7, currentHp: 104 },
      { maxHp: 107, currentHp: 104, restoredHp: 3, storedHp: null }],

    ["level, equipment, upgrade and permanent bonus together", 30,
      { level: 5, equipped: true, upgradeSelected: true, permanentHp: 7, currentHp: 196 },
      { maxHp: 199, currentHp: 196, restoredHp: 3, storedHp: null }],
  ];

  it.each(cases)("caps restoration using %s", (_label, equipHp, fixture, expected) => {
    expectHeal(makeSession(fixture), healingCatalog(equipHp), expected);
  });

  it("ignores an offered-but-unselected upgrade and an unequipped item", () => {
    // Level 5 with the +20 HP option present on the tier but absent from chosenUpgrades,
    // and the +30 HP amulet lying in the backpack: max HP is the bare level-5 base.
    expectHeal(
      makeSession({ level: 5, upgradeSelected: false, equipped: false, currentHp: 139 }),
      healingCatalog(30),
      { maxHp: LEVEL_5_BASE_HP, currentHp: 139, restoredHp: 3, storedHp: null },
    );
  });
});

describe("the supplied catalog decides both the healing cap and eligibility", () => {
  // Identical ids and identical potions; only the equipped amulet's HP bonus differs.
  const CATALOG_A = healingCatalog(30); // max 130
  const CATALOG_B = healingCatalog(50); // max 150

  it("defines every referenced id, so neither branch can stop at missing_definition", () => {
    for (const c of [CATALOG_A, CATALOG_B]) {
      for (const id of ["potion", "amulet"]) {
        expect(c.definitions[id]).toBeDefined();
        expect(c.metadataById[id]).toBeDefined();
      }
    }
  });

  it("heals the very same session to different values", () => {
    const wounded = makeSession({ level: 1, equipped: true, currentHp: 127 });

    expectHeal(wounded, CATALOG_A, { maxHp: 130, currentHp: 127, restoredHp: 3,  storedHp: null });
    expectHeal(wounded, CATALOG_B, { maxHp: 150, currentHp: 127, restoredHp: 10, storedHp: 137 });
  });

  it("decides eligibility at one and the same current HP", () => {
    const atThirty = makeSession({ level: 1, equipped: true, currentHp: 130 });

    // Under catalog A, 130 IS full HP.
    expect(evaluateItemUsability(useInput(atThirty, CATALOG_A)))
      .toEqual({ canUse: false, reason: "unit_full_hp" });
    expect(useItem(useInput(atThirty, CATALOG_A)))
      .toEqual({ ok: false, reason: "unit_full_hp" });
    expect(atThirty.inventory.instances.i_potion).toBeDefined();

    // Under catalog B the same unit is 20 HP short and the potion applies in full.
    expectHeal(atThirty, CATALOG_B, { maxHp: 150, currentHp: 130, restoredHp: 10, storedHp: 140 });
  });
});

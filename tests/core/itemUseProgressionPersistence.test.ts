import { describe, it, expect } from "vitest";
import { useItem } from "../../src/core/itemUse";
import { applyVictoryLevelUpPersistence } from "../../src/core/playerUnitPersistence";
import type { PlayerSessionState } from "../../src/core/playerSessionState";
import type { PlayerUnitState, RosterState } from "../../src/progression";
import { chooseUnitUpgrade } from "../../src/progression/rosterUpgrades";
import { resolveUnitProgression } from "../../src/progression/unitProgressionResolver";
import { resolveUnitBattleStats } from "../../src/progression/stats/unitResolvedStats";
import { PLAYER_UNITS } from "../../src/data/units";
import { ucid, UNIT_BATTLE_STAT_KEYS } from "../../src/shared/unitTypes";
import type { UnitBlueprint, UnitBattleStats } from "../../src/shared/unitTypes";
import type { ItemCatalog, PartialBattleStatBonuses } from "../../src/shared/itemTypes";
import { backpack, equipment, instance, catalog } from "../inventory/helpers";

/**
 * A consumable's permanent bonus must outlive later progression: it stays stored on the unit
 * AND keeps moving resolved stats after a real level-up and a real class change.
 *
 * Scope: the persistence operation itself, not the battle-exit pipeline that calls it —
 * `battleExit.applyBattleResult` composes placement + exit persistence + level-up, and driving
 * it would require fabricating a whole BattleRuntimeContext.
 */

const SOLDIER = PLAYER_UNITS.find(u => u.templateId === "soldier")!;
const BLUEPRINTS: readonly UnitBlueprint[] = [SOLDIER];

const KNIGHT_CLASS_ID = ucid("knight");

// UpgradeOptionId is branded (shared/unitTypes.ts) and must never be cast or compared to a plain
// string literal. Resolve the real option from the blueprint and reuse its already-typed id.
const TIER_5 = SOLDIER.upgradeTiers!.find(t => t.unlocksAtLevel === 5)!;
const PIERCE = TIER_5.options.find(o => o.classId === KNIGHT_CLASS_ID)!;

const START_LEVEL = 4;   // below tier 5, so the upgrade is genuinely locked until the level-up runs
const NEXT_LEVEL  = 5;
const HP_GAIN = 5;
const STR_GAIN = 2;
const EXPECTED_BONUSES: PartialBattleStatBonuses = { hp: HP_GAIN, physicalStrength: STR_GAIN };

const CATALOG: ItemCatalog = catalog({
  vitality: { kind: "consumable", slot: null,
    useEffect: { type: "permanent_stat_boost", stat: "hp", amount: HP_GAIN } },
  might:    { kind: "consumable", slot: null,
    useEffect: { type: "permanent_stat_boost", stat: "physicalStrength", amount: STR_GAIN } },
});

function soldierUnit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: START_LEVEL, isInCamp: false, lastPlacement: null,
    permanentBonuses: {}, chosenUpgrades: {},
    lifeState: "alive", currentHp: null,
    ...overrides,
  };
}

function startingSession(): PlayerSessionState {
  return {
    roster: { units: { soldier: soldierUnit() } },
    inventory: {
      instances: {
        i_vitality: instance("i_vitality", "vitality"),
        i_might:    instance("i_might", "might"),
      },
      containers: {
        backpack_shared: backpack("backpack_shared", { "0": "i_vitality", "1": "i_might" }),
        equip_soldier:   equipment("soldier", {}),
      },
    },
  };
}

/** Consumes both items in sequence, threading each result into the next call. */
function consumeBothItems(): PlayerSessionState {
  let session = startingSession();
  for (const instanceId of ["i_vitality", "i_might"]) {
    const result = useItem({
      session, catalog: CATALOG, playerBlueprints: BLUEPRINTS,
      unitTemplateId: "soldier", instanceId,
    });
    if (!result.ok) throw new Error(`consuming ${instanceId} failed: ${result.reason}`);
    session = result.nextSession;
  }
  return session;
}

/** Runs the real level-up operation, deriving newMaxHp exactly as production stat resolution does. */
function levelUpToFive(units: Record<string, PlayerUnitState>): Record<string, PlayerUnitState> {
  const unit = units.soldier;
  const progression = resolveUnitProgression(SOLDIER, unit.chosenUpgrades);
  const newMaxHp = resolveUnitBattleStats({
    blueprint: SOLDIER,
    level: NEXT_LEVEL,
    upgradeModifiers: progression.statModifiers,
    permanentBonuses: unit.permanentBonuses,
  }).hp;

  return applyVictoryLevelUpPersistence(units, [
    { templateId: "soldier", newLevel: NEXT_LEVEL, newMaxHp },
  ]);
}

/** Resolves the unit's stats twice — with its real bonuses and with none — holding all else equal. */
function statsWithAndWithoutBonuses(unit: PlayerUnitState): {
  withBonuses: UnitBattleStats; withoutBonuses: UnitBattleStats;
} {
  const upgradeModifiers = resolveUnitProgression(SOLDIER, unit.chosenUpgrades).statModifiers;
  const base = { blueprint: SOLDIER, level: unit.level, upgradeModifiers };
  return {
    withBonuses:    resolveUnitBattleStats({ ...base, permanentBonuses: unit.permanentBonuses }),
    withoutBonuses: resolveUnitBattleStats({ ...base, permanentBonuses: {} }),
  };
}

/** Asserts the two stat sets differ by exactly the expected deltas and in no other stat. */
function expectOnlyBonusDeltas(
  withBonuses: UnitBattleStats,
  withoutBonuses: UnitBattleStats,
  expected: PartialBattleStatBonuses,
): void {
  const deltas: PartialBattleStatBonuses = {};
  for (const key of UNIT_BATTLE_STAT_KEYS) {
    const delta = withBonuses[key] - withoutBonuses[key];
    if (delta !== 0) deltas[key] = delta;
  }
  expect(deltas).toEqual(expected);
}

describe("consumable bonuses survive progression", () => {
  it("uses the real class-changing tier-5 option", () => {
    // Guards the fixture itself: if the data ever loses this option, every test below is vacuous.
    expect(String(PIERCE.id)).toBe("soldier_5_pierce");
  });

  it("stores both bonuses when the consumables are used", () => {
    const session = consumeBothItems();
    expect(session.roster.units.soldier.permanentBonuses).toEqual(EXPECTED_BONUSES);
    expect(session.inventory.instances.i_vitality).toBeUndefined();
    expect(session.inventory.instances.i_might).toBeUndefined();
  });

  it("keeps the tier-5 upgrade locked until the level-up operation has run", () => {
    const consumed = consumeBothItems();
    expect(chooseUnitUpgrade(consumed.roster, BLUEPRINTS, {
      templateId: "soldier", tierId: 5, upgradeId: PIERCE.id,
    })).toEqual({ ok: false, reason: "level_locked" });
  });

  it("retains the bonuses through a real level-up, without mutating its input", () => {
    const consumed = consumeBothItems();
    const before = JSON.parse(JSON.stringify(consumed.roster.units));

    const levelled = levelUpToFive(consumed.roster.units);

    expect(levelled.soldier.level).toBe(NEXT_LEVEL);
    expect(levelled.soldier.permanentBonuses).toEqual(EXPECTED_BONUSES);
    expect(JSON.parse(JSON.stringify(consumed.roster.units))).toEqual(before);
  });

  it("still applies the bonuses to resolved stats after the level-up", () => {
    const levelled = levelUpToFive(consumeBothItems().roster.units);
    const { withBonuses, withoutBonuses } = statsWithAndWithoutBonuses(levelled.soldier);
    expectOnlyBonusDeltas(withBonuses, withoutBonuses, EXPECTED_BONUSES);
  });

  it("retains the bonuses through a real class-changing upgrade", () => {
    const levelled: RosterState = { units: levelUpToFive(consumeBothItems().roster.units) };

    const upgraded = chooseUnitUpgrade(levelled, BLUEPRINTS, {
      templateId: "soldier", tierId: 5, upgradeId: PIERCE.id,
    });
    if (!upgraded.ok) throw new Error(`upgrade failed: ${upgraded.reason}`);

    const unit = upgraded.nextRoster.units.soldier;
    expect(unit.chosenUpgrades[5]).toBe(PIERCE.id);
    expect(unit.permanentBonuses).toEqual(EXPECTED_BONUSES);

    // The class really changed — soldier → knight — so this exercises the intended scenario.
    expect(resolveUnitProgression(SOLDIER, {}).currentClassId).toEqual(SOLDIER.baseClassId);
    expect(resolveUnitProgression(SOLDIER, unit.chosenUpgrades).currentClassId)
      .toEqual(KNIGHT_CLASS_ID);
  });

  it("still applies the bonuses to resolved stats after the class change", () => {
    const levelled: RosterState = { units: levelUpToFive(consumeBothItems().roster.units) };
    const upgraded = chooseUnitUpgrade(levelled, BLUEPRINTS, {
      templateId: "soldier", tierId: 5, upgradeId: PIERCE.id,
    });
    if (!upgraded.ok) throw new Error(`upgrade failed: ${upgraded.reason}`);

    // Compared against the SAME upgraded unit without bonuses — the upgrade's own +20 HP is
    // present on both sides and therefore cancels out of the delta.
    const { withBonuses, withoutBonuses } =
      statsWithAndWithoutBonuses(upgraded.nextRoster.units.soldier);
    expectOnlyBonusDeltas(withBonuses, withoutBonuses, EXPECTED_BONUSES);
  });
});

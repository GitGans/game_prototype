import { describe, it, expect } from "vitest";
import { buildEquipmentScreenPlayerSnapshot } from "../../src/core/equipmentScreenSnapshot";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";
import type { PlayerSessionState } from "../../src/core/playerSessionState";

const UNIT_ID = PLAYER_UNITS[0].templateId;

function debugConfig(): DebugSessionConfig {
  return { level: 5, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };
}

function freshSession(): PlayerSessionState {
  return createDebugPlayerSession({ config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG });
}

/** Renames the session's shared backpack technical container id, keeping content identical. */
function withRenamedBackpack(session: PlayerSessionState, newId: string): PlayerSessionState {
  const oldId = Object.values(session.inventory.containers).find(c => c.kind === 'backpack')!.id;
  const { [oldId]: old, ...rest } = session.inventory.containers;
  return {
    roster: session.roster,
    inventory: { instances: session.inventory.instances, containers: { ...rest, [newId]: { ...old, id: newId } } },
  };
}

describe("buildEquipmentScreenPlayerSnapshot", () => {
  it("equivalent sessions with different backpack ids produce identical snapshots", () => {
    const a = freshSession();
    const b = withRenamedBackpack(freshSession(), 'loot_sack');

    const snapA = buildEquipmentScreenPlayerSnapshot(a, UNIT_ID);
    const snapB = buildEquipmentScreenPlayerSnapshot(b, UNIT_ID);

    expect(snapA).toEqual(snapB);
  });

  it("an unknown selected-unit id still returns backpack and available-unit data", () => {
    const session = freshSession();
    const snap = buildEquipmentScreenPlayerSnapshot(session, 'not_a_real_unit');

    expect(snap.selectedUnit).toBeNull();
    expect(snap.selectedUnitSpriteKey).toBeNull();
    expect(snap.unitStats).toBeNull();
    expect(snap.learnedSkills).toEqual([]);
    expect(snap.upgradeSkills).toEqual([]);
    expect(snap.backpack.slots.length).toBe(24);
    expect(snap.availableUnits.length).toBe(PLAYER_UNITS.length);
  });

  it("selected-unit equipment, stats, skills, and sprite are derived from the supplied session", () => {
    const session = freshSession();
    const snap = buildEquipmentScreenPlayerSnapshot(session, UNIT_ID);

    expect(snap.selectedUnit).not.toBeNull();
    expect(snap.selectedUnit!.templateId).toBe(UNIT_ID);
    expect(snap.unitStats).not.toBeNull();
    expect(snap.unitStats!.level).toBe(session.roster.units[UNIT_ID].level);
    expect(snap.learnedSkills.length).toBeGreaterThan(0);
  });

  it("does not require any campaign state to build a debug-sourced snapshot", () => {
    // No GameState setup at all — proves the builder only reads the passed-in session.
    const session = freshSession();
    expect(() => buildEquipmentScreenPlayerSnapshot(session, UNIT_ID)).not.toThrow();
  });
});

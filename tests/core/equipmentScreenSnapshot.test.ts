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


  describe("current HP projection", () => {
    const POTION = "item_start_small_healing_potion";

    /** Same shape the potion tests below use: a session wounded by `missing` HP. */
    function wounded(session: PlayerSessionState, missing: number): PlayerSessionState {
      const maxHp = buildEquipmentScreenPlayerSnapshot(session, UNIT_ID).unitStats!.maxHp.value;
      return {
        ...session,
        roster: { units: {
          ...session.roster.units,
          [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: maxHp - missing },
        } },
      };
    }

    it("shows a wounded character's actual HP against the resolved maximum", () => {
      const stats = buildEquipmentScreenPlayerSnapshot(wounded(freshSession(), 3), UNIT_ID).unitStats!;

      expect(stats.hp.value).toBe(stats.maxHp.value - 3);
    });

    it("shows the resolved maximum for an undamaged character", () => {
      const stats = buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID).unitStats!;

      expect(stats.hp.value).toBe(stats.maxHp.value);
    });

    it("shows 0 for a dead character, with the maximum unchanged", () => {
      const session = freshSession();
      const dead = {
        ...session,
        roster: { units: {
          ...session.roster.units,
          [UNIT_ID]: { ...session.roster.units[UNIT_ID], lifeState: "dead" as const, currentHp: 0 },
        } },
      };

      const stats = buildEquipmentScreenPlayerSnapshot(dead, UNIT_ID).unitStats!;

      expect(stats.hp.value).toBe(0);
      expect(stats.maxHp.value)
        .toBe(buildEquipmentScreenPlayerSnapshot(session, UNIT_ID).unitStats!.maxHp.value);
    });

    // The regression that matters most: both halves of ONE screen — the stat row and the
    // potion preview — must report the same health. They were built from different sources
    // and silently disagreed.
    it("displayed HP agrees with the healing-potion preview inside the same snapshot", () => {
      const snap = buildEquipmentScreenPlayerSnapshot(wounded(freshSession(), 3), UNIT_ID);
      const usage = snap.itemUsage[POTION];

      expect(usage.canUse).toBe(true);
      if (!usage.canUse || usage.effect.type !== "heal") throw new Error("expected a heal preview");
      expect(usage.effect.currentHp).toBe(snap.unitStats!.hp.value);
      expect(usage.effect.maxHp).toBe(snap.unitStats!.maxHp.value);
    });
  });

  describe("consumable projections", () => {
    const VITALITY = "item_start_vitality_essence";
    const POTION = "item_start_small_healing_potion";

    it("reports every backpack consumable as usable for a living selected character", () => {
      const snap = buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID);

      expect(snap.itemUsage[VITALITY]).toEqual({
        canUse: true,
        effect: { type: "permanent_stat_boost", stat: "hp", amount: 5, healsCurrentHp: true },
      });
    });

    it("blocks a healing potion for an undamaged character, and previews it for a hurt one", () => {
      const session = freshSession();
      const potionUsage = (s: typeof session) =>
        buildEquipmentScreenPlayerSnapshot(s, UNIT_ID).itemUsage[POTION];

      // The starting roster is at full HP (currentHp: null), so the potion restores nothing.
      expect(potionUsage(session)).toEqual({ canUse: false, reason: "unit_full_hp" });

      const maxHp = buildEquipmentScreenPlayerSnapshot(session, UNIT_ID).unitStats!.maxHp.value;
      const hurt = {
        ...session,
        roster: { units: {
          ...session.roster.units,
          [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: maxHp - 3 },
        } },
      };

      expect(potionUsage(hurt)).toEqual({
        canUse: true,
        // restoredHp is CLAMPED to the 3 missing HP, not the potion's authored 10.
        effect: { type: "heal", amount: 10, restoredHp: 3, currentHp: maxHp - 3, maxHp },
      });
    });

    it("keys usage by usable and consumable items, never by equipment", () => {
      const session = freshSession();
      const snap = buildEquipmentScreenPlayerSnapshot(session, UNIT_ID);

      for (const instanceId of Object.keys(snap.itemUsage)) {
        const definitionId = session.inventory.instances[instanceId].definitionId;
        expect(["usable", "consumable"]).toContain(ITEM_CATALOG.metadataById[definitionId].kind);
      }
      // The starting healing potion is a backpack USABLE and must be represented.
      expect(snap.itemUsage[POTION]).toBeDefined();
    });

    it("reports the blocking reason for a dead selected character rather than omitting the entry", () => {
      const session = freshSession();
      const dead = {
        ...session,
        roster: { units: {
          ...session.roster.units,
          [UNIT_ID]: { ...session.roster.units[UNIT_ID], lifeState: "dead" as const, currentHp: 0 },
        } },
      };

      const snap = buildEquipmentScreenPlayerSnapshot(dead, UNIT_ID);

      expect(snap.itemUsage[VITALITY]).toEqual({ canUse: false, reason: "unit_dead" });
      expect(snap.pendingItemUsePrompt).toBeNull();
    });

    it("projects a justified pending request with names and effect", () => {
      const snap = buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID, {
        kind: "confirming_use", instanceId: VITALITY, unitTemplateId: UNIT_ID,
      });

      expect(snap.pendingItemUsePrompt).toEqual({
        instanceId: VITALITY,
        unitTemplateId: UNIT_ID,
        unitName: PLAYER_UNITS.find(u => u.templateId === UNIT_ID)!.name,
        itemName: ITEM_CATALOG.definitions.vitality_essence.name,
        effect: { type: "permanent_stat_boost", stat: "hp", amount: 5, healsCurrentHp: true },
      });
    });

    it("omits a prompt whose target is not the selected character", () => {
      const other = PLAYER_UNITS[1].templateId;
      const snap = buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID, {
        instanceId: VITALITY, unitTemplateId: other,
      });

      expect(snap.pendingItemUsePrompt).toBeNull();
    });

    it("omits a prompt for an item no longer in the backpack", () => {
      const snap = buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID, {
        instanceId: "already_consumed", unitTemplateId: UNIT_ID,
      });

      expect(snap.pendingItemUsePrompt).toBeNull();
    });

    it("omits a prompt when no request is pending", () => {
      expect(buildEquipmentScreenPlayerSnapshot(freshSession(), UNIT_ID).pendingItemUsePrompt)
        .toBeNull();
    });
  });

  it("does not require any campaign state to build a debug-sourced snapshot", () => {
    // No GameState setup at all — proves the builder only reads the passed-in session.
    const session = freshSession();
    expect(() => buildEquipmentScreenPlayerSnapshot(session, UNIT_ID)).not.toThrow();
  });
});

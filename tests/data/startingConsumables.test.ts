import { describe, it, expect } from "vitest";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { buildStartingInventory } from "../../src/inventory";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { InventoryState } from "../../src/inventory";

const VITALITY = "item_start_vitality_essence";
const MIGHT = "item_start_might_essence";

/** Both essences present, in the shared backpack, at the authored slots. */
function expectBothEssences(inventory: InventoryState): void {
  expect(inventory.instances[VITALITY]).toEqual({ id: VITALITY, definitionId: "vitality_essence" });
  expect(inventory.instances[MIGHT]).toEqual({ id: MIGHT, definitionId: "might_essence" });

  const shared = Object.values(inventory.containers).find(
    c => c.kind === "backpack" && c.ownerTemplateId === undefined,
  )!;
  expect(shared.slots["2"]).toBe(VITALITY);
  expect(shared.slots["3"]).toBe(MIGHT);
}

describe("CAMPAIGN_STARTING_ITEMS", () => {
  it("carries five entries: two rings, an equipped necklace and both essences", () => {
    expect(CAMPAIGN_STARTING_ITEMS).toHaveLength(5);
    expect(CAMPAIGN_STARTING_ITEMS.map(i => i.instanceId)).toEqual([
      "item_start_bronze_ring",
      "item_start_iron_ring",
      "item_start_bronze_necklace",
      VITALITY,
      MIGHT,
    ]);
  });

  it("keeps the two pre-existing backpack rings at slots 0 and 1", () => {
    const rings = CAMPAIGN_STARTING_ITEMS.filter(i => i.instanceId.endsWith("_ring"));
    expect(rings.map(i => i.placement)).toEqual([
      { kind: "backpack", slot: "0" },
      { kind: "backpack", slot: "1" },
    ]);
  });

  it("keeps the necklace equipped on the warrior", () => {
    const necklace = CAMPAIGN_STARTING_ITEMS.find(i => i.instanceId.endsWith("_necklace"))!;
    expect(necklace.placement).toEqual({ kind: "equipped", unitTemplateId: "warrior" });
  });

  it("names consumables the catalog actually declares", () => {
    for (const id of ["vitality_essence", "might_essence"]) {
      expect(ITEM_CATALOG.metadataById[id].kind).toBe("consumable");
      expect(ITEM_CATALOG.definitions[id].useEffect?.type).toBe("permanent_stat_boost");
    }
  });
});

describe("both essences reach every session built from the shared definition", () => {
  it("appear in a freshly built inventory", () => {
    const { itemInstances, itemContainers } = buildStartingInventory({
      playerUnitTemplateIds: PLAYER_UNITS.map(u => u.templateId),
      catalog: ITEM_CATALOG,
      startingItems: CAMPAIGN_STARTING_ITEMS,
    });

    expectBothEssences({ instances: itemInstances, containers: itemContainers });
  });

  it("appear in a new campaign", () => {
    const campaign = initCampaignState({
      playerUnits: PLAYER_UNITS,
      itemCatalog: ITEM_CATALOG,
      startingItems: CAMPAIGN_STARTING_ITEMS,
      mapDefinitions: MAP_DEFINITIONS,
      initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
    });

    expectBothEssences(campaign.inventory);
  });

  it("appear in a debug session, and its rebuild restores them with no bonuses carried over", () => {
    const config = { level: 5, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };
    const build = () => createDebugPlayerSession({
      config, playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG,
    });

    const session = build();
    expectBothEssences(session.inventory);

    // `resetDebugSession` rebuilds from initialConfig through this same pure factory, so a
    // rebuild is what a reset restores: both essences back, permanent bonuses discarded.
    const rebuilt = build();
    expectBothEssences(rebuilt.inventory);
    for (const unit of Object.values(rebuilt.roster.units)) {
      expect(unit.permanentBonuses).toEqual({});
    }
  });
});

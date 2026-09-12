import { beforeEach, describe, it, expect } from "vitest";
import {
  readItemInteractionSlot,
  writeItemInteractionSlot,
  clearItemInteractionSlot,
} from "../../src/core/itemInteractionStorage";
import { readItemInteractionForPhase } from "../../src/core/itemInteractionAccess";
import { setItemInteraction, clearItemInteraction } from "../../src/core/itemInteractionWriteAccess";
import { EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT } from "../../src/core/phases";
import type { GamePhase } from "../../src/core/phases";

function equipPhase(selectedUnitTemplateId: string): GamePhase {
  return {
    type: "equip_screen",
    sessionSource: "campaign",
    selectedUnitTemplateId,
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    returnPhase: { type: "main_menu" },
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    availableUnits: [],
    unitStats: null,
    learnedSkills: [],
    upgradeSkills: [],
    itemUsage: {},
    pendingItemUsePrompt: null,
  };
}

function debugEquipPhase(selectedUnitTemplateId: string): GamePhase {
  return {
    type: "debug_equip_screen",
    sessionSource: "debug",
    selectedUnitTemplateId,
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    availableUnits: [],
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    unitStats: null,
    campUnitIds: [],
    selectedForBattleUnitCount: 0,
    activeLivingUnitCount: 0,
    canStartBattle: false,
    learnedSkills: [],
    upgradeSkills: [],
    itemUsage: {},
    pendingItemUsePrompt: null,
  };
}

beforeEach(() => {
  clearItemInteractionSlot("campaign");
  clearItemInteractionSlot("debug");
});

describe("itemInteractionStorage", () => {
  it("returns a defensive copy, so a reader cannot reassign the stored request", () => {
    writeItemInteractionSlot("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    const first = readItemInteractionSlot("campaign");
    (first as { instanceId: string }).instanceId = "tampered";

    expect(readItemInteractionSlot("campaign"))
      .toEqual({ instanceId: "i1", unitTemplateId: "warrior" });
  });

  it("copies on write too, so a later caller mutation cannot reach the cell", () => {
    const request = { instanceId: "i1", unitTemplateId: "warrior" };
    writeItemInteractionSlot("campaign", request);
    (request as { instanceId: string }).instanceId = "tampered";

    expect(readItemInteractionSlot("campaign")?.instanceId).toBe("i1");
  });

  it("isolates the two owners", () => {
    writeItemInteractionSlot("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    writeItemInteractionSlot("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    expect(readItemInteractionSlot("campaign")?.instanceId).toBe("i_camp");
    expect(readItemInteractionSlot("debug")?.instanceId).toBe("i_debug");
  });

  it("clears one owner without touching the other", () => {
    writeItemInteractionSlot("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    writeItemInteractionSlot("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    clearItemInteractionSlot("debug");

    expect(readItemInteractionSlot("campaign")).not.toBeNull();
    expect(readItemInteractionSlot("debug")).toBeNull();
  });

  it("clears idempotently", () => {
    clearItemInteractionSlot("campaign");
    expect(() => clearItemInteractionSlot("campaign")).not.toThrow();
    expect(readItemInteractionSlot("campaign")).toBeNull();
  });
});

describe("readItemInteractionForPhase", () => {
  it("returns a request the phase can justify", () => {
    setItemInteraction("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readItemInteractionForPhase(equipPhase("warrior")))
      .toEqual({ instanceId: "i1", unitTemplateId: "warrior" });
  });

  it("reads as absent from a phase that is not an equipment screen", () => {
    setItemInteraction("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readItemInteractionForPhase({ type: "main_menu" })).toBeNull();
    expect(readItemInteractionForPhase({ type: "debug_level_select" })).toBeNull();
  });

  it("reads as absent when the selected character has changed", () => {
    setItemInteraction("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readItemInteractionForPhase(equipPhase("healer"))).toBeNull();
  });

  it("never lets one session read the other's request, even with identical ids", () => {
    // A debug reset recreates the SAME authored instance ids, so matching ids prove nothing
    // about ownership — only the session key does.
    setItemInteraction("debug", { instanceId: "item_start_vitality_essence", unitTemplateId: "warrior" });

    expect(readItemInteractionForPhase(equipPhase("warrior"))).toBeNull();
    expect(readItemInteractionForPhase(debugEquipPhase("warrior")))
      .toEqual({ instanceId: "item_start_vitality_essence", unitTemplateId: "warrior" });
  });
});

describe("itemInteractionWriteAccess", () => {
  it("disposes only the named owner", () => {
    setItemInteraction("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    setItemInteraction("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    clearItemInteraction("campaign");

    expect(readItemInteractionForPhase(equipPhase("warrior"))).toBeNull();
    expect(readItemInteractionForPhase(debugEquipPhase("warrior"))).not.toBeNull();
  });
});

import { beforeEach, describe, it, expect } from "vitest";
import {
  readConsumeConfirmationSlot,
  writeConsumeConfirmationSlot,
  clearConsumeConfirmationSlot,
} from "../../src/core/consumeConfirmationStorage";
import { readPendingConsumeForPhase } from "../../src/core/consumeConfirmationAccess";
import { setPendingConsume, clearPendingConsume } from "../../src/core/consumeConfirmationWriteAccess";
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
    consumableUsage: {},
    pendingConsumePrompt: null,
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
    consumableUsage: {},
    pendingConsumePrompt: null,
  };
}

beforeEach(() => {
  clearConsumeConfirmationSlot("campaign");
  clearConsumeConfirmationSlot("debug");
});

describe("consumeConfirmationStorage", () => {
  it("returns a defensive copy, so a reader cannot reassign the stored request", () => {
    writeConsumeConfirmationSlot("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    const first = readConsumeConfirmationSlot("campaign");
    (first as { instanceId: string }).instanceId = "tampered";

    expect(readConsumeConfirmationSlot("campaign"))
      .toEqual({ instanceId: "i1", unitTemplateId: "warrior" });
  });

  it("copies on write too, so a later caller mutation cannot reach the cell", () => {
    const request = { instanceId: "i1", unitTemplateId: "warrior" };
    writeConsumeConfirmationSlot("campaign", request);
    (request as { instanceId: string }).instanceId = "tampered";

    expect(readConsumeConfirmationSlot("campaign")?.instanceId).toBe("i1");
  });

  it("isolates the two owners", () => {
    writeConsumeConfirmationSlot("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    writeConsumeConfirmationSlot("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    expect(readConsumeConfirmationSlot("campaign")?.instanceId).toBe("i_camp");
    expect(readConsumeConfirmationSlot("debug")?.instanceId).toBe("i_debug");
  });

  it("clears one owner without touching the other", () => {
    writeConsumeConfirmationSlot("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    writeConsumeConfirmationSlot("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    clearConsumeConfirmationSlot("debug");

    expect(readConsumeConfirmationSlot("campaign")).not.toBeNull();
    expect(readConsumeConfirmationSlot("debug")).toBeNull();
  });

  it("clears idempotently", () => {
    clearConsumeConfirmationSlot("campaign");
    expect(() => clearConsumeConfirmationSlot("campaign")).not.toThrow();
    expect(readConsumeConfirmationSlot("campaign")).toBeNull();
  });
});

describe("readPendingConsumeForPhase", () => {
  it("returns a request the phase can justify", () => {
    setPendingConsume("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readPendingConsumeForPhase(equipPhase("warrior")))
      .toEqual({ instanceId: "i1", unitTemplateId: "warrior" });
  });

  it("reads as absent from a phase that is not an equipment screen", () => {
    setPendingConsume("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readPendingConsumeForPhase({ type: "main_menu" })).toBeNull();
    expect(readPendingConsumeForPhase({ type: "debug_level_select" })).toBeNull();
  });

  it("reads as absent when the selected character has changed", () => {
    setPendingConsume("campaign", { instanceId: "i1", unitTemplateId: "warrior" });

    expect(readPendingConsumeForPhase(equipPhase("healer"))).toBeNull();
  });

  it("never lets one session read the other's request, even with identical ids", () => {
    // A debug reset recreates the SAME authored instance ids, so matching ids prove nothing
    // about ownership — only the session key does.
    setPendingConsume("debug", { instanceId: "item_start_vitality_essence", unitTemplateId: "warrior" });

    expect(readPendingConsumeForPhase(equipPhase("warrior"))).toBeNull();
    expect(readPendingConsumeForPhase(debugEquipPhase("warrior")))
      .toEqual({ instanceId: "item_start_vitality_essence", unitTemplateId: "warrior" });
  });
});

describe("consumeConfirmationWriteAccess", () => {
  it("disposes only the named owner", () => {
    setPendingConsume("campaign", { instanceId: "i_camp", unitTemplateId: "warrior" });
    setPendingConsume("debug", { instanceId: "i_debug", unitTemplateId: "warrior" });

    clearPendingConsume("campaign");

    expect(readPendingConsumeForPhase(equipPhase("warrior"))).toBeNull();
    expect(readPendingConsumeForPhase(debugEquipPhase("warrior"))).not.toBeNull();
  });
});

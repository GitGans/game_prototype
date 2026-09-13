import { describe, it, expect, beforeEach } from "vitest";
import {
  createLifecycleHarness, ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS,
  type LifecycleHarness,
} from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { clearItemInteractionSlot } from "../../src/core/itemInteractionStorage";
import {
  readBattleRuntimeSlot, writeBattleRuntimeSlot,
} from "../../src/core/battleRuntimeStorage";
import { initCampaignState } from "../../src/core/initCampaignState";
import type { GamePhase } from "../../src/core/phases";
import type { BattleMode } from "../../src/battle/types";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { SKILLS } from "../../src/data/skills/skillDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

/**
 * The equipped potion through the real pipeline: it appears on the bar, heals its owner,
 * disappears, advances exactly one turn, and becomes permanent only when the attempt is exited.
 */

const POTION = "item_start_small_healing_potion";

/** The potion's authored strength — read from the catalog, never repeated as a literal. */
const POTION_AMOUNT = (() => {
  const effect = ITEM_CATALOG.definitions.small_healing_potion.useEffect;
  if (effect?.type !== "heal") throw new Error("the starting potion is no longer a heal");
  return effect.amount;
})();

function battlePhase(h: LifecycleHarness): Extract<GamePhase, { type: "battle" }> {
  const phase = h.manager.getPhase();
  if (phase.type !== "battle") throw new Error(`expected a battle phase, got ${phase.type}`);
  return phase;
}

function runtime() {
  const rt = readBattleRuntimeSlot();
  if (!rt) throw new Error("no battle runtime installed");
  return rt;
}

/** The item entry on the active unit's bar, or null when none is offered. */
function itemAction(h: LifecycleHarness) {
  return battlePhase(h).activeUnitActions.find(a => a.kind === "item") ?? null;
}

function inventoryHas(instanceId: string): boolean {
  return PlayerSessionStore.getSession("campaign").inventory.instances[instanceId] !== undefined;
}

function equippedUsable(unitTemplateId: string): string | undefined {
  return PlayerSessionStore.getSession("campaign")
    .inventory.containers[`equip_${unitTemplateId}`]?.slots.usable_slot;
}

/** Equips the potion on a unit, then starts a campaign battle and begins combat. */
function startBattleWithEquippedPotion(unitTemplateId: string): LifecycleHarness {
  const h = createLifecycleHarness();
  h.startNewCampaign();
  h.manager.transition({ type: "open_equip_screen", unitTemplateId });
  h.manager.transition({ type: "open_item_actions", instanceId: POTION });
  h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "equip" });
  expect(equippedUsable(unitTemplateId)).toBe(POTION);
  h.manager.transition({ type: "close_equip_screen" });

  h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
  h.manager.transition({ type: "battle_begin_combat" });
  return h;
}

/** The battle unit id carrying the potion, and its owner's template id. */
function carrier(): { unitId: string; templateId: string } {
  const entries = [...runtime().usableResources];
  if (entries.length !== 1) throw new Error(`expected one carrier, got ${entries.length}`);
  const [unitId, resource] = entries[0];
  return { unitId, templateId: resource.unitTemplateId };
}

/** Wounds the carrier in the runtime and makes it the active unit on a manual turn. */
function makeCarrierActiveAndWounded(h: LifecycleHarness, hp = 1): string {
  const rt = runtime();
  const { unitId } = carrier();
  const unit = rt.state.units.get(unitId)!;
  const units = new Map(rt.state.units);
  units.set(unitId, { ...unit, hp });
  writeBattleRuntimeSlot({
    ...rt,
    mode: "manual",
    state: {
      ...rt.state,
      units,
      phase: "select_target",
      roundQueue: [unitId, ...rt.state.roundQueue.filter(id => id !== unitId)],
    },
  });
  // Rebuild the committed snapshot from the doctored runtime.
  h.manager.transition({ type: "battle_preview_target", target: { side: "player", row: 0, col: 0 } });
  h.manager.transition({ type: "battle_clear_preview_target" });
  return unitId;
}

function setMode(mode: BattleMode): void {
  const rt = runtime();
  writeBattleRuntimeSlot({ ...rt, mode });
}

beforeEach(() => {
  GameState.setCampaignState(initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
  GameState.clearDebugState();
  clearItemInteractionSlot("campaign");
  clearItemInteractionSlot("debug");
});

describe("the potion on the skill bar", () => {
  it("appears after the character's ordinary skills, named after the item", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h);

    const actions = battlePhase(h).activeUnitActions;
    const skills = actions.filter(a => a.kind === "skill");
    const item = itemAction(h);

    expect(item).not.toBeNull();
    // Ordinary skill indexes are untouched, and the item comes last.
    expect(skills.map(s => s.kind === "skill" && s.skillIndex)).toEqual(skills.map((_, i) => i));
    expect(actions[actions.length - 1]).toBe(item);
    expect(item).toMatchObject({
      kind: "item", unitId, instanceId: POTION,
      label: "Small Healing Potion", enabled: true, disabledReason: null,
    });
  });

  it("is visible but DISABLED at full health, with the recoverable reason", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = carrier().unitId;
    const rt = runtime();
    const unit = rt.state.units.get(unitId)!;
    writeBattleRuntimeSlot({
      ...rt,
      state: {
        ...rt.state, phase: "select_target",
        roundQueue: [unitId, ...rt.state.roundQueue.filter(id => id !== unitId)],
      },
    });
    h.manager.transition({ type: "battle_clear_preview_target" });

    expect(unit.hp).toBe(unit.maxHp);
    expect(itemAction(h)).toMatchObject({ enabled: false, disabledReason: "unit_full_hp" });
  });

  it("does not exist at all in automatic or quick mode", () => {
    // `not_manual_mode` is an execution-time refusal, not a render state: outside manual player
    // control the action is absent, not disabled.
    const h = startBattleWithEquippedPotion("warrior");
    makeCarrierActiveAndWounded(h);
    expect(itemAction(h)).not.toBeNull();

    for (const mode of ["auto", "quick"] as BattleMode[]) {
      setMode(mode);
      h.manager.transition({ type: "battle_clear_preview_target" });
      expect(itemAction(h), `mode ${mode}`).toBeNull();
    }
  });

  it("shares no effect object with the runtime or the catalog", () => {
    const h = startBattleWithEquippedPotion("warrior");
    makeCarrierActiveAndWounded(h);

    const item = itemAction(h)!;
    if (item.kind !== "item") throw new Error("expected an item entry");
    expect(item.effect).not.toBe(runtime().usableResources.get(carrier().unitId)!.effect);
    expect(item.effect).not.toBe(ITEM_CATALOG.definitions.small_healing_potion.useEffect);
  });

  it("cannot be edited into the runtime or the catalog", () => {
    // Copying the Map alone would pass the identity check above and still fail this: the
    // ENTRIES and their effects have to be copied too.
    const h = startBattleWithEquippedPotion("warrior");
    const { unitId } = carrier();
    makeCarrierActiveAndWounded(h);

    const item = itemAction(h)!;
    if (item.kind !== "item" || item.effect.type !== "heal") throw new Error("expected a heal item");
    (item.effect as { amount: number }).amount = 9999;

    const runtimeEffect = runtime().usableResources.get(unitId)!.effect;
    expect(runtimeEffect.type === "heal" && runtimeEffect.amount).toBe(POTION_AMOUNT);
    const authored = ITEM_CATALOG.definitions.small_healing_potion.useEffect;
    expect(authored?.type === "heal" && authored.amount).toBe(POTION_AMOUNT);
  });

  it("the runtime resource cannot be edited into the catalog either", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const { unitId } = carrier();

    const effect = runtime().usableResources.get(unitId)!.effect;
    (effect as { amount: number }).amount = 1;

    const authored = ITEM_CATALOG.definitions.small_healing_potion.useEffect;
    expect(authored?.type === "heal" && authored.amount).toBe(POTION_AMOUNT);
  });
});

describe("using the potion in combat", () => {
  it("heals its owner, consumes it, removes the action and advances one turn", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    // Captured BEFORE the use — the resource is gone afterwards, which is the point.
    const templateId = carrier().templateId;
    const queueBefore = battlePhase(h).roundQueue;

    const result = h.manager.transition({
      type: "battle_use_item", unitId, instanceId: POTION,
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.battleFeedback?.itemUse)
      .toEqual({ applied: true, itemName: "Small Healing Potion", restoredHp: POTION_AMOUNT });

    // Healed by the authored amount.
    expect(runtime().state.units.get(unitId)!.hp).toBe(1 + POTION_AMOUNT);
    // The resource is gone and exactly one record was appended.
    expect(runtime().usableResources.has(unitId)).toBe(false);
    expect(runtime().consumedItems).toEqual([
      { instanceId: POTION, definitionId: "small_healing_potion", unitTemplateId: templateId },
    ]);
    // Exactly one turn advanced.
    expect(runtime().state.roundQueue[0]).not.toBe(unitId);
    expect(runtime().state.roundQueue.length).toBeLessThan(queueBefore.length);
    // The action disappears immediately from the committed snapshot.
    expect(itemAction(h)).toBeNull();
  });

  it("emits one item_heal event naming the item", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);

    const result = h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    if (result.status !== "applied") throw new Error("expected applied");

    expect(result.battleFeedback?.events).toContainEqual(
      expect.objectContaining({ type: "item_heal", unitId, itemName: "Small Healing Potion" }),
    );
  });

  it("cannot be used twice — a repeated click heals nothing and advances nothing", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    const hpAfterFirst = runtime().state.units.get(unitId)!.hp;
    const queueAfterFirst = runtime().state.roundQueue;

    const second = h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    expect(second.status).toBe("rejected");
    expect(runtime().state.units.get(unitId)!.hp).toBe(hpAfterFirst);
    expect(runtime().state.roundQueue).toEqual(queueAfterFirst);
    expect(runtime().consumedItems).toHaveLength(1);
  });

  it("is rejected in automatic and quick mode even when dispatched directly", () => {
    // Excluding potions from AI selection is not enough: the action itself must refuse.
    for (const mode of ["auto", "quick"] as BattleMode[]) {
      const h = startBattleWithEquippedPotion("warrior");
      const unitId = makeCarrierActiveAndWounded(h, 1);
      setMode(mode);
      h.manager.transition({ type: "battle_clear_preview_target" });

      const hpBefore = runtime().state.units.get(unitId)!.hp;
      const queueBefore = runtime().state.roundQueue;

      const result = h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

      expect(result.status, `mode ${mode}`).toBe("rejected");
      expect(runtime().state.units.get(unitId)!.hp).toBe(hpBefore);
      expect(runtime().state.roundQueue).toEqual(queueBefore);
      expect(runtime().consumedItems).toEqual([]);
      expect(runtime().usableResources.has(unitId)).toBe(true);
    }
  });

  it("rejects a wrong actor, a wrong instance and a full-health actor", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);

    expect(h.manager.transition({
      type: "battle_use_item", unitId: "not_a_unit", instanceId: POTION,
    }).status).toBe("rejected");
    expect(h.manager.transition({
      type: "battle_use_item", unitId, instanceId: "not_an_item",
    }).status).toBe("rejected");

    // Heal to full, then try again.
    const rt = runtime();
    const unit = rt.state.units.get(unitId)!;
    const units = new Map(rt.state.units);
    units.set(unitId, { ...unit, hp: unit.maxHp });
    writeBattleRuntimeSlot({ ...rt, state: { ...rt.state, units } });
    h.manager.transition({ type: "battle_clear_preview_target" });

    expect(h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION }).status)
      .toBe("rejected");
    expect(runtime().consumedItems).toEqual([]);
  });

  it("does not touch the persistent inventory during combat", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    const templateId = carrier().templateId;

    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    // Still equipped in the session: settlement happens on exit, not mid-battle.
    expect(equippedUsable(templateId)).toBe(POTION);
    expect(inventoryHas(POTION)).toBe(true);
  });
});

describe("settling on exit", () => {
  it("removes the potion permanently on victory, leaving usable_slot empty", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    const templateId = carrier().templateId;
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    h.manager.transition({ type: "exit_battle", outcome: "victory" });

    expect(inventoryHas(POTION)).toBe(false);
    expect(equippedUsable(templateId)).toBeUndefined();
  });

  it("removes it on defeat and on an abandonment exit too", () => {
    for (const outcome of ["defeat"] as const) {
      const h = startBattleWithEquippedPotion("warrior");
      const unitId = makeCarrierActiveAndWounded(h, 1);
      h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

      h.manager.transition({ type: "exit_battle", outcome });
      expect(inventoryHas(POTION), `outcome ${outcome}`).toBe(false);
    }

    const menuExit = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(menuExit, 1);
    menuExit.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    menuExit.manager.transition({ type: "exit_to_menu" });

    expect(inventoryHas(POTION)).toBe(false);
  });

  it("leaves an UNUSED potion equipped when the attempt ends", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const templateId = carrier().templateId;

    h.manager.transition({ type: "exit_battle", outcome: "victory" });

    expect(inventoryHas(POTION)).toBe(true);
    expect(equippedUsable(templateId)).toBe(POTION);
  });

  it("does not refill usable_slot from the backpack after consumption", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    const templateId = carrier().templateId;
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    h.manager.transition({ type: "exit_battle", outcome: "victory" });

    expect(equippedUsable(templateId)).toBeUndefined();
  });
});

describe("replay", () => {
  it("restores a potion the discarded attempt had spent", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    expect(runtime().consumedItems).toHaveLength(1);

    h.manager.transition({ type: "replay" });

    // Fresh resource, empty log: replay reconstructs from the CURRENT session, which still
    // holds the potion because nothing was settled.
    expect(runtime().consumedItems).toEqual([]);
    expect([...runtime().usableResources.values()].map(r => r.instanceId)).toEqual([POTION]);
    expect(inventoryHas(POTION)).toBe(true);
  });

  it("does not duplicate items or accumulate records across repeated replays", () => {
    const h = startBattleWithEquippedPotion("warrior");

    for (let i = 0; i < 3; i++) {
      const unitId = makeCarrierActiveAndWounded(h, 1);
      h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
      h.manager.transition({ type: "replay" });

      expect(runtime().consumedItems).toEqual([]);
      expect([...runtime().usableResources.values()]).toHaveLength(1);
    }

    const inventory = PlayerSessionStore.getSession("campaign").inventory;
    const potions = Object.values(inventory.instances)
      .filter(i => i.definitionId === "small_healing_potion");
    expect(potions).toHaveLength(1);
  });

  it("does not restore a potion that was drunk OUT of combat before the attempt", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: "warrior" });

    // Wound the warrior so the backpack use is eligible, then drink it before the battle.
    const session = PlayerSessionStore.getSession("campaign");
    PlayerSessionStore.replaceRoster("campaign", {
      units: { ...session.roster.units,
        warrior: { ...session.roster.units.warrior, currentHp: 1 } },
    });
    // Re-render the committed snapshot so the resolver sees the wound it must decide from.
    h.manager.transition({ type: "switch_equip_unit", templateId: "warrior" });
    h.manager.transition({ type: "request_use_item", instanceId: POTION });
    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: "warrior",
    });
    expect(inventoryHas(POTION)).toBe(false);

    h.manager.transition({ type: "close_equip_screen" });
    h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
    h.manager.transition({ type: "replay" });

    expect(inventoryHas(POTION)).toBe(false);
    expect(runtime().usableResources.size).toBe(0);
  });

  it("does not restore items spent in an earlier COMPLETED battle", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    h.manager.transition({ type: "exit_battle", outcome: "victory" });
    expect(inventoryHas(POTION)).toBe(false);

    h.manager.transition({ type: "exit_results" });
    h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);

    expect(runtime().usableResources.size).toBe(0);
    expect(inventoryHas(POTION)).toBe(false);
  });
});

describe("session lifecycle sequencing", () => {
  /**
   * A debug reset recreates the SAME authored instance ids, so an outgoing attempt's record
   * would match a brand-new item by id alone. Settlement runs against the OUTGOING session,
   * before any replacement — this is what keeps that impossible.
   */
  it("new_game from a live battle settles the outgoing campaign, not the new one", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    h.manager.transition({ type: "new_game" });

    // The freshly created campaign is untouched by the discarded attempt's record.
    expect(inventoryHas(POTION)).toBe(true);
    expect(equippedUsable("warrior")).toBeUndefined();
    expect(readBattleRuntimeSlot()).toBeNull();
  });

  it("exit_to_menu from a debug battle settles the debug session before it is cleared", () => {
    const h = createLifecycleHarness();
    h.openDebugSession(1);
    h.manager.transition({ type: "switch_debug_unit", templateId: "warrior" });
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "equip" });
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    h.manager.transition({ type: "battle_begin_combat" });

    const unitId = makeCarrierActiveAndWounded(h, 1);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    // Must not throw: the debug session still exists when settlement runs, and is cleared after.
    expect(() => h.manager.transition({ type: "exit_to_menu" })).not.toThrow();
    expect(GameState.getDebugState()).toBeNull();
    // The campaign session was never the settlement target.
    expect(inventoryHas(POTION)).toBe(true);
  });
});

// ─── A targetless carrier keeps its turn ──────────────────────────────────────

/**
 * Gives the carrier only a revive skill. No player unit is dead at the start of these battles, so
 * the selected skill has no valid target under the real targeting rules — without any item-aware
 * input reaching the turn-start rule.
 */
function makeCarrierTargetless(unitId: string): void {
  const rt = runtime();
  const unit = rt.state.units.get(unitId)!;
  const units = new Map(rt.state.units);
  units.set(unitId, { ...unit, skills: [SKILLS.revive], activeSkillIndex: 0 });
  writeBattleRuntimeSlot({ ...rt, state: { ...rt.state, units } });
}

function startTargetlessTurn(h: LifecycleHarness, hp: number): string {
  const unitId = makeCarrierActiveAndWounded(h, hp);
  makeCarrierTargetless(unitId);
  const result = h.manager.transition({ type: "battle_start_turn" });
  if (result.status !== "applied") throw new Error("expected battle_start_turn to apply");
  expect(result.battleFeedback.directive).toEqual({ type: "await_manual_action", activeUnitId: unitId });
  expect(result.battleFeedback.events).toEqual([]);
  return unitId;
}

describe("a targetless carrier", () => {
  it("keeps the turn, with the potion enabled on its bar", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const queueBefore = battlePhase(h).roundQueue;
    const unitId = startTargetlessTurn(h, 1);

    const phase = battlePhase(h);
    expect(phase.activeUnitId).toBe(unitId);
    expect(phase.validTargets).toEqual([]);
    expect(phase.manualTurnControlsVisible).toBe(true);
    expect(itemAction(h)).toMatchObject({ kind: "item", instanceId: POTION, enabled: true });
    // Nothing advanced while waiting.
    expect(phase.roundQueue.length).toBe(queueBefore.length);
  });

  it("keeps the turn at full health too, with the potion visible but disabled", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const { unitId } = carrier();
    const maxHp = runtime().state.units.get(unitId)!.maxHp;
    startTargetlessTurn(h, maxHp);

    expect(itemAction(h)).toMatchObject({ enabled: false, disabledReason: "unit_full_hp" });
  });

  it("drinking completes exactly one turn", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = startTargetlessTurn(h, 1);
    const queueBefore = battlePhase(h).roundQueue;

    const result = h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });
    if (result.status !== "applied") throw new Error("expected applied");

    expect(result.battleFeedback.itemUse?.applied).toBe(true);
    expect(runtime().state.units.get(unitId)!.hp).toBe(1 + POTION_AMOUNT);
    expect(itemAction(h)).toBeNull();
    expect(runtime().state.roundQueue).toEqual(queueBefore.slice(1));
  });

  it("a refused activation completes no turn", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const { unitId } = carrier();
    const maxHp = runtime().state.units.get(unitId)!.maxHp;
    startTargetlessTurn(h, maxHp);
    const queueBefore = battlePhase(h).roundQueue;

    const result = h.manager.transition({ type: "battle_use_item", unitId, instanceId: POTION });

    expect(result.status === "applied" ? result.battleFeedback.itemUse : undefined).toBeUndefined();
    expect(runtime().state.roundQueue).toEqual(queueBefore);
    expect(runtime().state.units.get(unitId)!.hp).toBe(maxHp);
  });

  it("an automatic carrier is never made to drink", () => {
    const h = startBattleWithEquippedPotion("warrior");
    const unitId = makeCarrierActiveAndWounded(h, 1);
    makeCarrierTargetless(unitId);
    setMode("auto");

    h.manager.transition({ type: "battle_start_turn" });
    h.manager.transition({ type: "battle_decide_auto_turn" });
    h.manager.transition({ type: "battle_apply_auto_turn" });

    expect(runtime().usableResources.has(unitId)).toBe(true);
    expect(runtime().consumedItems).toEqual([]);
    expect(runtime().state.units.get(unitId)!.hp).toBe(1);
    // The automatic turn still completed.
    expect(runtime().state.roundQueue[0]).not.toBe(unitId);
  });

  it("behaves the same in a debug battle", () => {
    const h = createLifecycleHarness();
    h.openDebugSession(1);
    h.manager.transition({ type: "switch_debug_unit", templateId: "warrior" });
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "equip" });
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    h.manager.transition({ type: "battle_begin_combat" });

    startTargetlessTurn(h, 1);

    expect(battlePhase(h).sessionSource).toBe("debug");
    expect(itemAction(h)).toMatchObject({ kind: "item", instanceId: POTION, enabled: true });
  });
});

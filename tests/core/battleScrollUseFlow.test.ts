import { describe, it, expect, beforeEach, vi } from "vitest";
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
import { buildBattlePhaseTargetPreviewModel } from "../../src/core/battleSkillPreviewProjection";
import type { GamePhase } from "../../src/core/phases";
import type { CellCoord } from "../../src/shared/gridTypes";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import { buildRoundQueue } from "../../src/battle/initiative";
import { getLivingFieldUnitEntries } from "../../src/battle/deployment";
import { computeReviveHpFromPercent } from "../../src/battle/revive";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

/**
 * The equipped Small Resurrection Scroll through the real pipeline: equip, select, preview,
 * confirm on a corpse, consumption, the queue at a round boundary, coherence after a mode change,
 * refusals that keep the whole targeting interaction, settlement and rollback — and backpack Use
 * staying unsupported.
 */

const SCROLL = "item_start_small_resurrection_scroll";
const POTION = "item_start_small_healing_potion";
const CARRIER = "warrior";

/** The scroll's authored strength — read from the catalog, never repeated as a literal. */
const SCROLL_PERCENT = (() => {
  const effect = ITEM_CATALOG.definitions.small_resurrection_scroll.useEffect;
  if (effect?.type !== "revive") throw new Error("the starting scroll is no longer a revive");
  return effect.hpPercent;
})();

type BattlePhase = Extract<GamePhase, { type: "battle" }>;

function battlePhase(h: LifecycleHarness): BattlePhase {
  const phase = h.manager.getPhase();
  if (phase.type !== "battle") throw new Error(`expected a battle phase, got ${phase.type}`);
  return phase;
}

function runtime() {
  const rt = readBattleRuntimeSlot();
  if (!rt) throw new Error("no battle runtime installed");
  return rt;
}

function itemAction(h: LifecycleHarness) {
  return battlePhase(h).activeUnitActions.find(a => a.kind === "item") ?? null;
}

function session() {
  return PlayerSessionStore.getSession("campaign");
}

function equippedUsable(templateId: string): string | undefined {
  return session().inventory.containers[`equip_${templateId}`]?.slots.usable_slot;
}

function sharedBackpackSlot(slot: string): string | undefined {
  const shared = Object.values(session().inventory.containers)
    .find(c => c.kind === "backpack" && c.ownerTemplateId === undefined)!;
  return shared.slots[slot];
}

function equipThroughWindow(h: LifecycleHarness, instanceId: string): void {
  h.manager.transition({ type: "open_item_actions", instanceId });
  h.manager.transition({ type: "select_item_action", instanceId, action: "equip" });
}

/** Equips the scroll on the carrier through the equip screen, then starts a battle and begins combat. */
function startBattleWithEquippedScroll(): LifecycleHarness {
  const h = createLifecycleHarness();
  h.startNewCampaign();
  h.manager.transition({ type: "open_equip_screen", unitTemplateId: CARRIER });
  equipThroughWindow(h, SCROLL);
  expect(equippedUsable(CARRIER)).toBe(SCROLL);
  h.manager.transition({ type: "close_equip_screen" });

  h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
  h.manager.transition({ type: "battle_begin_combat" });
  return h;
}

/** Rebuilds the committed snapshot from a doctored runtime through two harmless actions. */
function refreshSnapshot(h: LifecycleHarness): void {
  h.manager.transition({ type: "battle_preview_target", target: { side: "player", row: 0, col: 0 } });
  h.manager.transition({ type: "battle_clear_preview_target" });
}

/**
 * Kills another player FIELD unit and makes the carrier the active manual unit. With
 * `lastInRound` the queue is only the carrier, so its turn-ending action closes the round.
 */
function makeCarrierActiveWithFallenAlly(
  h: LifecycleHarness,
  opts: { lastInRound?: boolean } = {},
): { unitId: string; fallenId: string; corpseCell: CellCoord } {
  const rt = runtime();
  const carrierId = [...rt.usableResources].find(([, r]) => r.instanceId === SCROLL)?.[0];
  if (!carrierId) throw new Error("no scroll carrier in the runtime");

  const fallenEntry = getLivingFieldUnitEntries(rt.state)
    .find(([id, u]) => id !== carrierId && u.side === "player");
  if (!fallenEntry) throw new Error("fixture needs a second living player unit on the field");
  const [fallenId, fallen] = fallenEntry;

  const units = new Map(rt.state.units);
  units.set(fallenId, killUnit(fallen));
  const remaining = rt.state.roundQueue.filter(id => id !== carrierId && id !== fallenId);
  writeBattleRuntimeSlot({
    ...rt,
    mode: "manual",
    state: {
      ...rt.state,
      units,
      occupancy: buildOccupancy(units, rt.state.deployments),
      phase: "select_target",
      roundQueue: opts.lastInRound ? [carrierId] : [carrierId, ...remaining],
    },
  });
  refreshSnapshot(h);

  const deployment = rt.state.deployments.get(fallenId);
  if (deployment?.kind !== "field") throw new Error("fallen unit is not on the field");
  return { unitId: carrierId, fallenId, corpseCell: deployment.anchor };
}

function selectScroll(h: LifecycleHarness, unitId: string) {
  return h.manager.transition({ type: "battle_select_item", unitId, instanceId: SCROLL });
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

// ─── Equipment ────────────────────────────────────────────────────────────────

describe("equipping the scroll", () => {
  function onEquipScreen(): LifecycleHarness {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: CARRIER });
    return h;
  }

  it("goes into usable_slot through the generic equip flow, emptying its backpack slot", () => {
    const h = onEquipScreen();
    expect(sharedBackpackSlot("5")).toBe(SCROLL);

    equipThroughWindow(h, SCROLL);

    expect(equippedUsable(CARRIER)).toBe(SCROLL);
    expect(sharedBackpackSlot("5")).toBeUndefined();
  });

  it("replaces an equipped potion by the normal swap rule: the potion takes the scroll's slot", () => {
    const h = onEquipScreen();
    equipThroughWindow(h, POTION);
    expect(equippedUsable(CARRIER)).toBe(POTION);

    equipThroughWindow(h, SCROLL);

    expect(equippedUsable(CARRIER)).toBe(SCROLL);
    expect(sharedBackpackSlot("5")).toBe(POTION);
  });

  it("unequips back into the backpack", () => {
    const h = onEquipScreen();
    equipThroughWindow(h, SCROLL);

    h.manager.transition({ type: "unequip_item", unitTemplateId: CARRIER, slot: "usable_slot" });

    expect(equippedUsable(CARRIER)).toBeUndefined();
    expect(Object.values(session().inventory.containers)
      .some(c => c.kind === "backpack" && Object.values(c.slots).includes(SCROLL))).toBe(true);
  });
});

describe("backpack Use stays unsupported", () => {
  it("offers Use disabled with unsupported_effect, and selecting it changes nothing", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: CARRIER });
    h.manager.transition({ type: "open_item_actions", instanceId: SCROLL });

    const phase = h.manager.getPhase();
    if (phase.type !== "equip_screen") throw new Error("expected the equip screen");
    expect(phase.itemActionMenu?.options.find(o => o.action === "use"))
      .toEqual({ action: "use", enabled: false, disabledReason: "unsupported_effect" });

    const before = session();
    h.manager.transition({ type: "select_item_action", instanceId: SCROLL, action: "use" });

    const after = session();
    expect(after.roster).toBe(before.roster);
    expect(after.inventory).toBe(before.inventory);
    expect(after.inventory.instances[SCROLL]).toBeDefined();
  });
});

// ─── The action bar ──────────────────────────────────────────────────────────

describe("the scroll on the action bar", () => {
  it("comes after the skills, carrying its target mode and a copied effect", () => {
    const h = startBattleWithEquippedScroll();
    makeCarrierActiveWithFallenAlly(h);

    const actions = battlePhase(h).activeUnitActions;
    expect(actions[actions.length - 1]).toBe(itemAction(h));
    expect(itemAction(h)).toMatchObject({
      kind: "item", instanceId: SCROLL, label: "Small Resurrection Scroll",
      targetMode: "dead_ally", effect: { type: "revive", hpPercent: SCROLL_PERCENT },
      enabled: true, disabledReason: null,
    });
  });

  it("is visible but disabled with no_valid_targets while nobody has fallen", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, fallenId } = makeCarrierActiveWithFallenAlly(h);
    // Undo the death: nobody lies dead on the field.
    const rt = runtime();
    const units = new Map(rt.state.units);
    units.set(fallenId, { ...rt.state.units.get(fallenId)!, lifeState: "alive", hp: 1 });
    writeBattleRuntimeSlot({ ...rt, state: { ...rt.state, units } });
    refreshSnapshot(h);

    expect(battlePhase(h).activeUnitId).toBe(unitId);
    expect(itemAction(h)).toMatchObject({ enabled: false, disabledReason: "no_valid_targets" });
    expect(selectScroll(h, unitId).status).toBe("rejected");
  });

  it("is absent in auto and quick mode", () => {
    for (const mode of ["auto", "quick"] as const) {
      const h = startBattleWithEquippedScroll();
      makeCarrierActiveWithFallenAlly(h);
      writeBattleRuntimeSlot({ ...runtime(), mode });
      refreshSnapshot(h);
      expect(itemAction(h), mode).toBeNull();
    }
  });
});

// ─── Select, preview, confirm ────────────────────────────────────────────────

describe("targeting and resurrection", () => {
  it("selecting enters targeting mode from committed state: selection, corpse cells, revive highlight", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, corpseCell } = makeCarrierActiveWithFallenAlly(h);

    expect(selectScroll(h, unitId).status).toBe("applied");

    const phase = battlePhase(h);
    expect(phase.selectedUsableInstanceId).toBe(SCROLL);
    expect(runtime().selectedUsableInstanceId).toBe(SCROLL);
    expect(phase.validTargets).toEqual([corpseCell]);
    expect(phase.targetHighlightKind).toBe("revive_target");
    expect(Object.keys(runtime().state)).not.toContain("selectedUsableInstanceId");
  });

  it("previews the corpse with the same HP execution will restore", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, fallenId, corpseCell } = makeCarrierActiveWithFallenAlly(h);
    selectScroll(h, unitId);

    h.manager.transition({ type: "battle_preview_target", target: corpseCell });

    const phase = battlePhase(h);
    const maxHp = runtime().state.units.get(fallenId)!.maxHp;
    expect(phase.selectedUsableInstanceId).toBe(SCROLL);
    expect(phase.previewTargetUnitId).toBe(fallenId);
    expect(buildBattlePhaseTargetPreviewModel({ phase, targetCoord: corpseCell })).toMatchObject({
      kind: "item_revive",
      itemName: "Small Resurrection Scroll",
      restoredHp: computeReviveHpFromPercent({ maxHp }, SCROLL_PERCENT),
      cells: [{ coord: corpseCell, kind: "effect", highlight: "revive" }],
    });
  });

  it("confirming revives the corpse, consumes the scroll and ends exactly one turn", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, fallenId, corpseCell } = makeCarrierActiveWithFallenAlly(h);
    selectScroll(h, unitId);
    h.manager.transition({ type: "battle_preview_target", target: corpseCell });
    const queueBefore = runtime().state.roundQueue;
    const maxHp = runtime().state.units.get(fallenId)!.maxHp;
    const expected = computeReviveHpFromPercent({ maxHp }, SCROLL_PERCENT);

    const result = h.manager.transition({
      type: "battle_use_item", unitId, instanceId: SCROLL, target: corpseCell,
    });
    if (result.status !== "applied" || !result.battleFeedback) throw new Error("expected feedback");

    expect(result.battleFeedback.itemUse).toEqual({
      applied: true, kind: "revive", itemName: "Small Resurrection Scroll",
      targetUnitId: fallenId, restoredHp: expected,
    });
    expect(result.battleFeedback.events).toContainEqual(expect.objectContaining({
      type: "item_revive", unitId, targetId: fallenId, amount: expected,
    }));
    expect(runtime().state.units.get(fallenId)).toMatchObject({ lifeState: "alive", hp: expected });

    // Consumed atomically: resource gone, one record, selection and preview cleared.
    expect(runtime().usableResources.has(unitId)).toBe(false);
    expect(runtime().consumedItems).toEqual([
      { instanceId: SCROLL, definitionId: "small_resurrection_scroll", unitTemplateId: CARRIER },
    ]);
    expect(runtime().selectedUsableInstanceId).toBeNull();
    expect(runtime().state.previewTargetCoord).toBeNull();

    // Round continues: the next unit acts, and the revived one did NOT join the current round.
    expect(battlePhase(h).activeUnitId).toBe(queueBefore[1]);
    expect(runtime().state.roundQueue).toEqual(queueBefore.slice(1));
    expect(runtime().state.roundQueue).not.toContain(fallenId);
    expect(itemAction(h)).toBeNull();
  });

  it("when the owner's action ends the round, the revived unit is in the NEXT round's queue", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, fallenId, corpseCell } = makeCarrierActiveWithFallenAlly(h, { lastInRound: true });
    selectScroll(h, unitId);

    h.manager.transition({ type: "battle_use_item", unitId, instanceId: SCROLL, target: corpseCell });

    const state = runtime().state;
    // A freshly built round, in initiative order — not delayed by an extra round.
    expect(state.roundQueue).toEqual(buildRoundQueue(new Map(getLivingFieldUnitEntries(state))));
    expect(state.roundQueue).toContain(fallenId);
  });
});

// ─── Coherence and refusals ──────────────────────────────────────────────────

describe("the targeting interaction stays coherent", () => {
  function selectedAndPreviewed() {
    const h = startBattleWithEquippedScroll();
    const ids = makeCarrierActiveWithFallenAlly(h);
    selectScroll(h, ids.unitId);
    h.manager.transition({ type: "battle_preview_target", target: ids.corpseCell });
    return { h, ...ids };
  }

  it("leaving manual mode cancels selection, targets and preview in the same transition", () => {
    const { h } = selectedAndPreviewed();

    h.manager.transition({ type: "battle_set_mode", mode: "auto" });

    // Read immediately — no follow-up turn-start action is dispatched.
    const phase = battlePhase(h);
    expect(phase.selectedUsableInstanceId).toBeNull();
    expect(phase.validTargets).toEqual([]);
    expect(phase.previewTargetCoord).toBeNull();
    expect(phase.previewTargetUnitId).toBeNull();
    expect(phase.targetHighlightKind).toBe("none");
    expect(runtime().selectedUsableInstanceId).toBeNull();
  });

  it("an applied skill switch replaces the item targeting with the skill's", () => {
    const { h } = selectedAndPreviewed();

    h.manager.transition({ type: "battle_select_skill", skillIndex: 0 });

    expect(runtime().selectedUsableInstanceId).toBeNull();
    expect(battlePhase(h).selectedUsableInstanceId).toBeNull();
    expect(battlePhase(h).previewTargetCoord).toBeNull();
    expect(battlePhase(h).targetHighlightKind).not.toBe("revive_target");
  });

  it("skipping the turn clears the selection", () => {
    const { h } = selectedAndPreviewed();
    h.manager.transition({ type: "battle_skip_turn", reason: "manual_skip" });
    expect(runtime().selectedUsableInstanceId).toBeNull();
  });

  /**
   * Each refusal is admitted by the resolver and refused by the battle domain. `prepare` doctors
   * the runtime where the refusal needs it; the runtime is captured AFTER that, so reference
   * identity proves the refused action wrote nothing.
   */
  type Ctx = ReturnType<typeof selectedAndPreviewed>;
  const refusals: Array<{ label: string; prepare?: (ctx: Ctx) => void; dispatch: (ctx: Ctx) => void }> = [
    {
      label: "a stale battle_apply_auto_turn",
      dispatch: ({ h }) => { h.manager.transition({ type: "battle_apply_auto_turn" }); },
    },
    {
      label: "a second battle_charge_turn in the same round",
      prepare: ({ unitId }) => {
        writeBattleRuntimeSlot({ ...runtime(), turnContext: { chargedThisRound: new Set([unitId]) } });
      },
      dispatch: ({ h }) => { h.manager.transition({ type: "battle_charge_turn" }); },
    },
    {
      label: "battle_select_skill while a non-player unit is at the head of the queue",
      prepare: ({ unitId }) => {
        const rt = runtime();
        const enemyId = [...rt.state.units.values()].find(u => u.side === "enemy")!.id;
        writeBattleRuntimeSlot({ ...rt, state: { ...rt.state, roundQueue: [enemyId, unitId] } });
      },
      dispatch: ({ h }) => { h.manager.transition({ type: "battle_select_skill", skillIndex: 0 }); },
    },
  ];

  for (const { label, prepare, dispatch } of refusals) {
    it(`${label} keeps the selection, the target cells AND the preview`, () => {
      const ctx = selectedAndPreviewed();
      prepare?.(ctx);
      const before = runtime().state;

      dispatch(ctx);

      const after = runtime();
      expect(after.state).toBe(before);
      expect(after.selectedUsableInstanceId).toBe(SCROLL);
      expect(after.state.validTargets).toEqual([ctx.corpseCell]);
      expect(after.state.previewTargetCoord).toEqual(ctx.corpseCell);
    });
  }

  it("the committed preview survives a refusal too", () => {
    const { h, fallenId } = selectedAndPreviewed();
    h.manager.transition({ type: "battle_apply_auto_turn" });
    expect(battlePhase(h).previewTargetUnitId).toBe(fallenId);
    expect(battlePhase(h).selectedUsableInstanceId).toBe(SCROLL);
  });
});

describe("resolver admission", () => {
  it("rejects every obviously invalid item action without touching the runtime", () => {
    const h = startBattleWithEquippedScroll();
    const { unitId, corpseCell } = makeCarrierActiveWithFallenAlly(h);
    const livingCell = runtime().state.deployments.get(unitId)!;
    if (livingCell.kind !== "field") throw new Error("carrier not on the field");

    const expectRejected = (action: Parameters<typeof h.manager.transition>[0], label: string) => {
      const before = readBattleRuntimeSlot();
      expect(h.manager.transition(action).status, label).toBe("rejected");
      expect(readBattleRuntimeSlot(), label).toBe(before);
    };

    // Not selected yet.
    expectRejected({ type: "battle_use_item", unitId, instanceId: SCROLL, target: corpseCell },
      "use before selecting");
    selectScroll(h, unitId);
    expectRejected({ type: "battle_use_item", unitId, instanceId: SCROLL, target: null },
      "use with no target");
    expectRejected({ type: "battle_use_item", unitId, instanceId: SCROLL, target: livingCell.anchor },
      "use on a non-target cell");
    expectRejected({ type: "battle_use_skill", unitId, target: corpseCell },
      "a skill confirmation while the scroll is selected");

    h.manager.transition({ type: "battle_use_item", unitId, instanceId: SCROLL, target: corpseCell });
    expectRejected({ type: "battle_select_item", unitId, instanceId: SCROLL }, "select after consumption");
  });
});

// ─── Settlement and rollback ─────────────────────────────────────────────────

describe("settling the scroll", () => {
  function reviveSomeone(): LifecycleHarness {
    const h = startBattleWithEquippedScroll();
    const { unitId, corpseCell } = makeCarrierActiveWithFallenAlly(h);
    selectScroll(h, unitId);
    h.manager.transition({ type: "battle_use_item", unitId, instanceId: SCROLL, target: corpseCell });
    expect(runtime().consumedItems).toHaveLength(1);
    return h;
  }

  for (const outcome of ["victory", "defeat"] as const) {
    it(`removes it permanently on ${outcome}`, () => {
      const h = reviveSomeone();
      h.manager.transition({ type: "exit_battle", outcome });
      expect(session().inventory.instances[SCROLL]).toBeUndefined();
      expect(equippedUsable(CARRIER)).toBeUndefined();
    });
  }

  it("exit_to_menu writes nothing: the scroll stays equipped and the revive is not committed", () => {
    const h = reviveSomeone();
    // Captured AFTER battle_begin_combat, which persisted the confirmed placement mid-battle:
    // abandonment restores nothing, it writes nothing.
    const before = session();
    const replaceSession = vi.spyOn(PlayerSessionStore, "replaceSession");

    h.manager.transition({ type: "exit_to_menu" });

    expect(replaceSession).not.toHaveBeenCalled();
    expect(session().roster).toBe(before.roster);
    expect(session().inventory).toBe(before.inventory);
    expect(equippedUsable(CARRIER)).toBe(SCROLL);
    replaceSession.mockRestore();
  });

  it("replay restores the scroll, with nothing selected and nothing consumed", () => {
    const h = reviveSomeone();

    h.manager.transition({ type: "replay" });

    expect(runtime().consumedItems).toEqual([]);
    expect(runtime().selectedUsableInstanceId).toBeNull();
    expect([...runtime().usableResources.values()].map(r => r.instanceId)).toEqual([SCROLL]);
    expect(equippedUsable(CARRIER)).toBe(SCROLL);
  });
});

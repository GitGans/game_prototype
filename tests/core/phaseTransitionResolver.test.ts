import { describe, expect, it } from "vitest";
import { resolveTransition } from "../../src/core/phaseTransitionResolver";
import { EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT } from "../../src/core/phases";
import type { GamePhase, PhaseAction } from "../../src/core/phases";

type WorldMapPhase = Extract<GamePhase, { type: "world_map" }>;
type CampPhase = Extract<GamePhase, { type: "camp" }>;
type DebugEquipScreenPhase = Extract<GamePhase, { type: "debug_equip_screen" }>;
type EquipScreenPhase = Extract<GamePhase, { type: "equip_screen" }>;
type UpgradeTreePhase = Extract<GamePhase, { type: "upgrade_tree" }>;
type BattlePhase = Extract<GamePhase, { type: "battle" }>;
type BattleResultsPhase = Extract<GamePhase, { type: "battle_results" }>;

const metadata = { mapCleared: false };

function worldMapPhase(canStartBattle: boolean): WorldMapPhase {
  return {
    type: "world_map",
    mapId: "test_map",
    partyPos: { x: 0, y: 0 },
    mapState: { entityStates: {} },
    selectedForBattleUnitCount: 1,
    activeLivingUnitCount: canStartBattle ? 1 : 0,
    canStartBattle,
  };
}

function campPhase(overrides: Partial<CampPhase> = {}): CampPhase {
  return {
    type: "camp",
    sessionSource: "campaign",
    returnPhase: worldMapPhase(true),
    units: [],
    selectedForBattleUnitCount: 1,
    activeLivingUnitCount: 1,
    canStartBattle: true,
    ...overrides,
  };
}

function debugEquipScreenPhase(overrides: Partial<DebugEquipScreenPhase> = {}): DebugEquipScreenPhase {
  return {
    type: "debug_equip_screen",
    sessionSource: "debug",
    selectedUnitTemplateId: "unit_1",
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    availableUnits: [],
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    unitStats: null,
    campUnitIds: [],
    selectedForBattleUnitCount: 1,
    activeLivingUnitCount: 1,
    canStartBattle: true,
    learnedSkills: [],
    upgradeSkills: [],
    consumableUsage: {},
    pendingConsumePrompt: null,
    ...overrides,
  };
}

function equipScreenPhase(overrides: Partial<EquipScreenPhase> = {}): EquipScreenPhase {
  return {
    type: "equip_screen",
    sessionSource: "campaign",
    selectedUnitTemplateId: "unit_1",
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    returnPhase: worldMapPhase(true),
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    availableUnits: [],
    unitStats: null,
    learnedSkills: [],
    upgradeSkills: [],
    consumableUsage: {},
    pendingConsumePrompt: null,
    ...overrides,
  };
}

function upgradeTreePhase(overrides: Partial<UpgradeTreePhase> = {}): UpgradeTreePhase {
  return {
    type: "upgrade_tree",
    sessionSource: "campaign",
    unitTemplateId: "unit_1",
    unitName: "Unit One",
    returnPhase: equipScreenPhase(),
    upgradeTiers: [],
    ...overrides,
  };
}

function makeBattlePhase(overrides: Partial<BattlePhase> = {}): BattlePhase {
  return {
    type: "battle",
    sessionSource: "campaign",
    enemyGroupId: "test_enemies",
    returnPhase: worldMapPhase(true),
    triggerPos: undefined,
    mapId: undefined,
    participants: [],
    benchUnits: [],
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
    battlePhase: "placement",
    canBeginCombat: false,
    fieldUnits: [],
    unitsById: new Map(),
    occupancy: { cellToUnitId: new Map(), unitToCells: new Map() },
    fieldUnitCells: { cellToUnitIds: new Map(), unitToCells: new Map() },
    roundQueue: [],
    activeUnitId: null,
    activeUnit: null,
    battleMode: "manual",
    activeUnitSide: null,
    manualTurnControlsVisible: false,
    manualChargeDisabled: false,
    validTargets: [],
    targetHighlightKind: "none",
    previewTargetCoord: null,
    previewTargetUnitId: null,
    ...overrides,
  };
}

function battleResultsPhase(overrides: Partial<BattleResultsPhase> = {}): BattleResultsPhase {
  return {
    type: "battle_results",
    sessionSource: "campaign",
    participantSeeds: [],
    units: [],
    returnPhase: worldMapPhase(true),
    mapCleared: false,
    ...overrides,
  };
}

describe("phaseTransitionResolver", () => {
  it("allows an action in its valid phase", () => {
    expect(
      resolveTransition({ type: "main_menu" }, { type: "debug" }, metadata),
    ).toEqual({ type: "debug_level_select" });
  });

  it("rejects an action in an invalid phase", () => {
    expect(
      resolveTransition(
        { type: "main_menu" },
        { type: "init_debug", level: 1 },
        metadata,
      ),
    ).toBeNull();
  });

  it("rejects battle start when the party cannot start a battle", () => {
    expect(
      resolveTransition(
        worldMapPhase(false),
        {
          type: "enter_battle",
          enemyGroupId: "test_enemies",
          triggerPos: { x: 1, y: 1 },
        },
        metadata,
      ),
    ).toBeNull();
  });

  it("uses explicit mapCleared metadata when leaving a victorious battle", () => {
    const result = resolveTransition(
      makeBattlePhase(),
      { type: "exit_battle", outcome: "victory" },
      { mapCleared: true },
    );

    expect(result).toMatchObject({
      type: "battle_results",
      mapCleared: true,
    });
  });

  describe("valid navigation routes", () => {
    const cases: Array<[string, GamePhase, PhaseAction, Partial<GamePhase>]> = [
      ["main_menu -> debug", { type: "main_menu" }, { type: "debug" }, { type: "debug_level_select" }],
      ["world_map -> debug", worldMapPhase(true), { type: "debug" }, { type: "debug_level_select" }],
      ["debug_level_select -> init_debug", { type: "debug_level_select" }, { type: "init_debug", level: 1 }, { type: "debug_equip_screen" }],
      ["debug_equip_screen -> return_to_debug_level_select", debugEquipScreenPhase(), { type: "return_to_debug_level_select" }, { type: "debug_level_select" }],
      ["world_map -> enter_camp", worldMapPhase(true), { type: "enter_camp" }, { type: "camp" }],
      ["camp -> exit_camp", campPhase(), { type: "exit_camp" }, { type: "world_map" }],
      ["world_map -> enter_battle", worldMapPhase(true), { type: "enter_battle", enemyGroupId: "e1", triggerPos: { x: 0, y: 0 } }, { type: "battle" }],
      ["debug_equip_screen -> start_battle", debugEquipScreenPhase(), { type: "start_battle", enemyGroupId: "e1" }, { type: "battle" }],
      ["world_map/camp -> open_equip_screen", worldMapPhase(true), { type: "open_equip_screen", unitTemplateId: "u1" }, { type: "equip_screen" }],
      ["equip_screen -> close_equip_screen", equipScreenPhase(), { type: "close_equip_screen" }, { type: "world_map" }],
      ["equip_screen/debug_equip_screen -> open_upgrade_tree", equipScreenPhase(), { type: "open_upgrade_tree" }, { type: "upgrade_tree" }],
      ["upgrade_tree -> close_upgrade_tree", upgradeTreePhase(), { type: "close_upgrade_tree" }, { type: "equip_screen" }],
      ["any -> exit_to_menu", campPhase(), { type: "exit_to_menu" }, { type: "main_menu" }],
    ];

    it.each(cases)("%s", (_name, current, action, expected) => {
      expect(resolveTransition(current, action, metadata)).toMatchObject(expected);
    });
  });

  describe("rejected transitions", () => {
    const cases: Array<[string, GamePhase, PhaseAction]> = [
      ["init_debug outside debug_level_select", { type: "main_menu" }, { type: "init_debug", level: 1 }],
      ["exit_camp outside camp", { type: "main_menu" }, { type: "exit_camp" }],
      ["enter_battle outside world_map", campPhase(), { type: "enter_battle", enemyGroupId: "e1", triggerPos: { x: 0, y: 0 } }],
      ["start_battle when canStartBattle is false", debugEquipScreenPhase({ canStartBattle: false }), { type: "start_battle", enemyGroupId: "e1" }],
      ["exit_battle outside battle", { type: "main_menu" }, { type: "exit_battle", outcome: "victory" }],
      ["exit_results outside battle_results", { type: "main_menu" }, { type: "exit_results" }],
      ["replay outside battle", { type: "main_menu" }, { type: "replay" }],
      ["open_equip_screen outside world_map/camp", { type: "main_menu" }, { type: "open_equip_screen", unitTemplateId: "u1" }],
      ["close_equip_screen outside equip screens", { type: "main_menu" }, { type: "close_equip_screen" }],
      ["open_upgrade_tree outside equip screens", { type: "main_menu" }, { type: "open_upgrade_tree" }],
      ["close_upgrade_tree outside upgrade_tree", { type: "main_menu" }, { type: "close_upgrade_tree" }],
      ["toggle_camp_unit outside camp/debug_equip_screen", { type: "main_menu" }, { type: "toggle_camp_unit", templateId: "u1" }],
      ["buy_item always rejected (shop stub)", worldMapPhase(true), { type: "buy_item", definitionId: "x" }],
      ["sell_item always rejected (shop stub)", worldMapPhase(true), { type: "sell_item", instanceId: "x" }],
      ["battle action outside battle", { type: "main_menu" }, { type: "battle_start_turn" }],
    ];

    it.each(cases)("%s -> null", (_name, current, action) => {
      expect(resolveTransition(current, action, metadata)).toBeNull();
    });
  });

  describe("mutation-only transitions return the same reference", () => {
    const battle = makeBattlePhase();
    const cases: Array<[string, GamePhase, PhaseAction]> = [
      ["move_party", worldMapPhase(true), { type: "move_party", partyPos: { x: 1, y: 1 } }],
      ["reset_debug_session", debugEquipScreenPhase(), { type: "reset_debug_session" }],
      ["equip_item", equipScreenPhase(), { type: "equip_item", instanceId: "i1", unitTemplateId: "u1" }],
      ["unequip_item", equipScreenPhase(), { type: "unequip_item", unitTemplateId: "u1", slot: "helmet" }],
      [
        "request_consume_item",
        equipScreenPhase({ consumableUsage: { i1: { canUse: true, effect: { stat: "hp", amount: 5, healsCurrentHp: true } } } }),
        { type: "request_consume_item", instanceId: "i1" },
      ],
      [
        "confirm_consume_item",
        equipScreenPhase({
          pendingConsumePrompt: {
            instanceId: "i1", unitTemplateId: "unit_1", unitName: "U", itemName: "E",
            stat: "hp", amount: 5, healsCurrentHp: true,
          },
        }),
        { type: "confirm_consume_item", instanceId: "i1", unitTemplateId: "unit_1" },
      ],
      [
        "cancel_consume_item",
        equipScreenPhase({
          pendingConsumePrompt: {
            instanceId: "i1", unitTemplateId: "unit_1", unitName: "U", itemName: "E",
            stat: "hp", amount: 5, healsCurrentHp: true,
          },
        }),
        { type: "cancel_consume_item" },
      ],
      ["choose_upgrade", upgradeTreePhase(), { type: "choose_upgrade", tierId: 5, upgradeId: "opt_1" }],
      ["toggle_camp_unit", campPhase(), { type: "toggle_camp_unit", templateId: "u1" }],
      ["battle_begin_combat", battle, { type: "battle_begin_combat" }],
      ["battle_set_mode", battle, { type: "battle_set_mode", mode: "auto" }],
      ["select_bench_slot", battle, { type: "select_bench_slot", benchIdx: 0 }],
      ["battle_start_turn", battle, { type: "battle_start_turn" }],
      ["battle_preview_target", battle, { type: "battle_preview_target", target: { x: 0, y: 0 } }],
    ];

    it.each(cases)("%s -> same reference", (_name, current, action) => {
      expect(resolveTransition(current, action, metadata)).toBe(current);
    });
  });


  describe("consumable confirmation routing", () => {
    const eligible = { i1: { canUse: true, effect: { stat: "hp", amount: 5, healsCurrentHp: true } } };
    const prompt = { instanceId: "i1", unitTemplateId: "unit_1", unitName: "U", itemName: "E", stat: "hp", amount: 5, healsCurrentHp: true };

    it("rejects a request from a non-equipment phase", () => {
      expect(resolveTransition(makeBattlePhase(), { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBeNull();
      expect(resolveTransition(worldMapPhase(true), { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBeNull();
    });

    it("rejects a request for an ineligible item", () => {
      const phase = equipScreenPhase({
        consumableUsage: { i1: { canUse: false, reason: "unit_dead" } },
      });
      expect(resolveTransition(phase, { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBeNull();
    });

    it("rejects a request for an item the snapshot does not mention at all", () => {
      expect(resolveTransition(equipScreenPhase(), { type: "request_consume_item", instanceId: "i9" }, metadata))
        .toBeNull();
    });

    it("rejects a request while no character is selected", () => {
      const phase = equipScreenPhase({ selectedUnitTemplateId: "", consumableUsage: eligible });
      expect(resolveTransition(phase, { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBeNull();
    });

    it("rejects a second request while one is pending", () => {
      const phase = equipScreenPhase({ consumableUsage: eligible, pendingConsumePrompt: prompt });
      expect(resolveTransition(phase, { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBeNull();
    });

    it("rejects competing equipment mutations while a confirmation is pending", () => {
      const phase = equipScreenPhase({ pendingConsumePrompt: prompt });
      expect(resolveTransition(phase, { type: "equip_item", instanceId: "i2", unitTemplateId: "unit_1" }, metadata))
        .toBeNull();
      expect(resolveTransition(phase, { type: "unequip_item", unitTemplateId: "unit_1", slot: "helmet" }, metadata))
        .toBeNull();
    });

    it("rejects a confirmation with nothing pending", () => {
      expect(resolveTransition(
        equipScreenPhase(),
        { type: "confirm_consume_item", instanceId: "i1", unitTemplateId: "unit_1" },
        metadata,
      )).toBeNull();
    });

    it("rejects a confirmation naming a different instance than the pending one", () => {
      const phase = equipScreenPhase({ pendingConsumePrompt: prompt });
      expect(resolveTransition(
        phase,
        { type: "confirm_consume_item", instanceId: "i2", unitTemplateId: "unit_1" },
        metadata,
      )).toBeNull();
    });

    it("rejects a confirmation naming a different target than the pending one", () => {
      const phase = equipScreenPhase({ pendingConsumePrompt: prompt });
      expect(resolveTransition(
        phase,
        { type: "confirm_consume_item", instanceId: "i1", unitTemplateId: "other" },
        metadata,
      )).toBeNull();
    });

    it("rejects a confirmation whose target is no longer the selected character", () => {
      const phase = equipScreenPhase({
        selectedUnitTemplateId: "other", pendingConsumePrompt: prompt,
      });
      expect(resolveTransition(
        phase,
        { type: "confirm_consume_item", instanceId: "i1", unitTemplateId: "unit_1" },
        metadata,
      )).toBeNull();
    });

    it("rejects a cancellation with nothing pending", () => {
      expect(resolveTransition(equipScreenPhase(), { type: "cancel_consume_item" }, metadata))
        .toBeNull();
    });

    it("accepts all three from the debug equipment screen too", () => {
      const requesting = debugEquipScreenPhase({ consumableUsage: eligible });
      expect(resolveTransition(requesting, { type: "request_consume_item", instanceId: "i1" }, metadata))
        .toBe(requesting);

      const pending = debugEquipScreenPhase({
        pendingConsumePrompt: { ...prompt, unitTemplateId: "unit_1" },
      });
      expect(resolveTransition(pending, { type: "cancel_consume_item" }, metadata)).toBe(pending);
    });
  });

  describe("exit_results routing", () => {
    it("goes to map_victory when the map was cleared and returnPhase is world_map", () => {
      const results = battleResultsPhase({ mapCleared: true, returnPhase: worldMapPhase(true) });
      expect(resolveTransition(results, { type: "exit_results" }, metadata)).toEqual({
        type: "map_victory",
        mapId: (results.returnPhase as WorldMapPhase).mapId,
      });
    });

    it("goes to returnPhase when the map was not cleared", () => {
      const results = battleResultsPhase({ mapCleared: false, returnPhase: worldMapPhase(true) });
      expect(resolveTransition(results, { type: "exit_results" }, metadata)).toBe(results.returnPhase);
    });

    it("goes to returnPhase when mapCleared is true but returnPhase is not world_map (e.g. debug)", () => {
      const results = battleResultsPhase({ mapCleared: true, returnPhase: { type: "debug_level_select" } });
      expect(resolveTransition(results, { type: "exit_results" }, metadata)).toEqual({
        type: "debug_level_select",
      });
    });
  });

  describe("input immutability", () => {
    it("does not mutate the phase passed into a mutation-only transition", () => {
      const current = Object.freeze(worldMapPhase(true));
      expect(() =>
        resolveTransition(current, { type: "move_party", partyPos: { x: 2, y: 2 } }, metadata),
      ).not.toThrow();
    });

    it("does not mutate the phase passed into a navigation transition", () => {
      const current = Object.freeze(worldMapPhase(true));
      expect(() =>
        resolveTransition(
          current,
          { type: "enter_battle", enemyGroupId: "e1", triggerPos: { x: 0, y: 0 } },
          metadata,
        ),
      ).not.toThrow();
    });
  });
});

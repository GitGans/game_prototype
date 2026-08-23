import {
  GamePhase, PhaseAction, EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT,
  type UpgradeTreePhase,
} from './phases';

export interface PhaseTransitionMetadata {
  mapCleared: boolean;
}

type WorldMapPhase = Extract<GamePhase, { type: 'world_map' }>;
type DebugEquipScreenPhase = Extract<GamePhase, { type: 'debug_equip_screen' }>;
type BattlePhase = Extract<GamePhase, { type: 'battle' }>;
type EquipScreenPhase = Extract<GamePhase, { type: 'equip_screen' }>;

function buildNewGameWorldMapPlaceholder(): WorldMapPhase {
  // Placeholder — immediately superseded by rebuildPhaseSnapshot()'s world_map case, which reads
  // the freshly-created CampaignState (set in applyActionSideEffects, which runs first).
  return {
    type: 'world_map', mapId: '', partyPos: { x: 0, y: 0 }, mapState: { entityStates: {} },
    selectedForBattleUnitCount: 0, activeLivingUnitCount: 0, canStartBattle: false,
  };
}

function buildDebugEquipScreenPlaceholder(): DebugEquipScreenPhase {
  return {
    type: 'debug_equip_screen',
    sessionSource: 'debug',
    selectedUnitTemplateId: '',
    selectedUnitSpriteKey: null,          // filled by rebuildPhaseSnapshot
    selectedUnit: null,                   // filled by rebuildPhaseSnapshot
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
  };
}

function buildBattlePlaceholder(
  params: Pick<BattlePhase, 'sessionSource' | 'enemyGroupId' | 'returnPhase' | 'triggerPos' | 'mapId'>,
): BattlePhase {
  return {
    type: 'battle',
    ...params,
    participants:       [],                                                       // filled by rebuildPhaseSnapshot
    benchUnits:         [],                                                       // filled by rebuildPhaseSnapshot
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null }, // filled by rebuildPhaseSnapshot
    battlePhase:         'placement',
    canBeginCombat:      false,                                                   // filled by rebuildPhaseSnapshot
    fieldUnits:          [],
    unitsById:           new Map(),
    occupancy:           { cellToUnitId: new Map(), unitToCells: new Map() },
    fieldUnitCells:      { cellToUnitIds: new Map(), unitToCells: new Map() },
    roundQueue:          [],
    activeUnitId:        null,
    activeUnit:          null,
    battleMode:               'manual',                                           // filled by rebuildPhaseSnapshot
    activeUnitSide:           null,                                               // filled by rebuildPhaseSnapshot
    manualTurnControlsVisible: false,                                             // filled by rebuildPhaseSnapshot
    manualChargeDisabled:     false,                                              // filled by rebuildPhaseSnapshot
    validTargets:        [],
    targetHighlightKind: 'none',
    previewTargetCoord:  null,
    previewTargetUnitId: null,
  };
}

function buildEquipScreenPlaceholder(
  params: Pick<EquipScreenPhase, 'selectedUnitTemplateId' | 'returnPhase'>,
): EquipScreenPhase {
  return {
    type: 'equip_screen',
    sessionSource: 'campaign',
    ...params,
    selectedUnitSpriteKey: null,          // filled by rebuildPhaseSnapshot
    selectedUnit: null,                   // filled by rebuildPhaseSnapshot
    backpack: EMPTY_BACKPACK_SNAPSHOT,    // filled by rebuildPhaseSnapshot
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,  // filled by rebuildPhaseSnapshot
    availableUnits: [],                   // filled by rebuildPhaseSnapshot
    unitStats: null,                      // filled by rebuildPhaseSnapshot
    learnedSkills: [],                    // filled by rebuildPhaseSnapshot
    upgradeSkills: [],                    // filled by rebuildPhaseSnapshot
  };
}

function buildUpgradeTreePlaceholder(
  params: Pick<UpgradeTreePhase, 'sessionSource' | 'unitTemplateId' | 'returnPhase'>,
): UpgradeTreePhase {
  return {
    type: 'upgrade_tree',
    ...params,
    unitName: '',        // filled by rebuildPhaseSnapshot via buildUpgradeTreePlayerSnapshot
    upgradeTiers: [],    // filled by rebuildPhaseSnapshot
  };
}

export function resolveTransition(
  currentPhase: GamePhase,
  action: PhaseAction,
  metadata: PhaseTransitionMetadata,
): GamePhase | null {
  switch (action.type) {

    case 'new_game':
      return buildNewGameWorldMapPlaceholder();

    case 'debug':
      // Dispatched from the main menu and from the world map's debug entry.
      if (currentPhase.type !== 'main_menu' && currentPhase.type !== 'world_map') return null;
      return { type: 'debug_level_select' };

    case 'return_to_debug_level_select':
      // Recovery route: a debug session whose units all died can be rebuilt from scratch.
      if (currentPhase.type !== 'debug_equip_screen') return null;
      return { type: 'debug_level_select' };

    case 'init_debug':
      // Guarded so a debug session can never be replaced while a battle runtime is live.
      if (currentPhase.type !== 'debug_level_select') return null;
      return buildDebugEquipScreenPlaceholder();

    case 'reset_debug_session':
      // Restores the current session from its own initialConfig — same config, fresh roster/
      // inventory. Only from debug_equip_screen: an in-progress battle attempt can't have its
      // owning session replaced, and the player must leave battle_results first.
      if (currentPhase.type !== 'debug_equip_screen') return null;
      return currentPhase; // mutation-only: rebuildPhaseSnapshot() re-derives the screen from the new session

    case 'switch_debug_unit':
      if (currentPhase.type !== 'debug_equip_screen') return null;
      return { ...currentPhase, selectedUnitTemplateId: action.templateId };

    case 'move_party':
      if (currentPhase.type !== 'world_map') return null;
      return currentPhase; // mutation-only — position lives in CampaignState.world, not the phase

    case 'enter_battle':
      if (currentPhase.type !== 'world_map') return null;
      // Party validity is enforced here, before any side effect runs, so an
      // invalid party can never partially mutate campaign or battle state.
      if (!currentPhase.canStartBattle) return null;
      return buildBattlePlaceholder({
        sessionSource: 'campaign',
        enemyGroupId:  action.enemyGroupId,
        returnPhase:   currentPhase,
        triggerPos:    action.triggerPos,
        mapId:         currentPhase.mapId,
      });

    case 'enter_camp':
      if (currentPhase.type !== 'world_map') return null;
      return {
        type: 'camp',
        sessionSource: 'campaign',
        returnPhase: currentPhase,
        units: [],
        selectedForBattleUnitCount: 0,
        activeLivingUnitCount: 0,
        canStartBattle: false,
      };

    case 'exit_camp':
      if (currentPhase.type !== 'camp') return null;
      return currentPhase.returnPhase;

    case 'start_battle':
      if (currentPhase.type !== 'debug_equip_screen') return null;
      if (!currentPhase.canStartBattle) return null;
      return buildBattlePlaceholder({
        sessionSource: 'debug',
        enemyGroupId:  action.enemyGroupId,
        returnPhase:   currentPhase,
        triggerPos:    undefined,
        mapId:         undefined,
      });

    case 'exit_battle':
      if (currentPhase.type !== 'battle') return null;
      if (action.outcome === 'defeat') return currentPhase.returnPhase;
      return {
        type:          'battle_results',
        sessionSource: currentPhase.sessionSource,
        // Immutable presentation metadata only — no initial-attempt level or life state.
        participantSeeds: currentPhase.participants.map(p => ({
          templateId: p.templateId,
          name:       p.name,
          wasOnBench: p.wasOnBench,
          spriteKey:  p.spriteKey,
        })),
        units:         [],                 // filled by rebuildPhaseSnapshot from the stored roster
        returnPhase:   currentPhase.returnPhase,
        mapCleared:    metadata.mapCleared,
      };

    case 'exit_results':
      if (currentPhase.type !== 'battle_results') return null;
      if (currentPhase.mapCleared && currentPhase.returnPhase.type === 'world_map') {
        return { type: 'map_victory', mapId: currentPhase.returnPhase.mapId };
      }
      return currentPhase.returnPhase;

    case 'replay':
      if (currentPhase.type !== 'battle') return null;
      return { ...currentPhase };

    case 'exit_to_menu':
      return { type: 'main_menu' };

    // ── Equip screen navigation ──────────────────────────────────────────────

    case 'open_equip_screen':
      if (currentPhase.type !== 'world_map' && currentPhase.type !== 'camp') return null;
      return buildEquipScreenPlaceholder({
        selectedUnitTemplateId: action.unitTemplateId,
        returnPhase: currentPhase,
      });

    case 'close_equip_screen':
      if (currentPhase.type === 'equip_screen') return currentPhase.returnPhase;
      if (currentPhase.type === 'debug_equip_screen') return { ...currentPhase, selectedUnitTemplateId: '' };
      return null;

    case 'switch_equip_unit':
      if (currentPhase.type !== 'equip_screen') return null;
      // Returns new object → triggers rebuildPhaseSnapshot for new unit's equipment
      return { ...currentPhase, selectedUnitTemplateId: action.templateId };

    // ── Mutation-only — return same reference → rebuildPhaseSnapshot + STATE_CHANGED ──

    case 'equip_item':
      if (currentPhase.type !== 'equip_screen' && currentPhase.type !== 'debug_equip_screen') return null;
      return currentPhase;

    case 'unequip_item':
      if (currentPhase.type !== 'equip_screen' && currentPhase.type !== 'debug_equip_screen') return null;
      return currentPhase;

    // ── Upgrade tree navigation ──────────────────────────────────────────────
    case 'open_upgrade_tree': {
      if (currentPhase.type !== 'equip_screen' && currentPhase.type !== 'debug_equip_screen') return null;
      return buildUpgradeTreePlaceholder({
        sessionSource: currentPhase.sessionSource,
        unitTemplateId: currentPhase.selectedUnitTemplateId,
        returnPhase: currentPhase,
      });
    }

    case 'close_upgrade_tree':
      if (currentPhase.type !== 'upgrade_tree') return null;
      return currentPhase.returnPhase;

    // ── Upgrade choice (mutation-only) ───────────────────────────────────────
    case 'choose_upgrade':
      if (currentPhase.type !== 'upgrade_tree') return null;
      return currentPhase; // mutation-only → rebuildPhaseSnapshot refreshes upgrade tiers

    // ── Camp unit toggle (mutation-only) ─────────────────────────────────────
    case 'toggle_camp_unit':
      if (currentPhase.type !== 'camp' && currentPhase.type !== 'debug_equip_screen') return null;
      return currentPhase; // mutation-only → rebuildPhaseSnapshot refreshes camp/campUnitIds/activeLivingUnitCount

    // ── Commerce — stub until 'shop' phase exists ────────────────────────────
    case 'buy_item':
    case 'sell_item':
      return null; // no shop phase yet

    // ── Battle lifecycle (mutation-only) ─────────────────────────────────────
    case 'battle_begin_combat':
    case 'battle_mark_quick_battle_complete':
      if (currentPhase.type !== 'battle') return null;
      return currentPhase;

    // ── Battle control (mutation-only) ───────────────────────────────────────
    case 'battle_set_mode':
    case 'battle_prepare_quick_battle':
      if (currentPhase.type !== 'battle') return null;
      return currentPhase;

    // ── Battle placement (mutation-only) ─────────────────────────────────────
    case 'select_bench_slot':
    case 'select_field_unit':
    case 'clear_placement_selection':
    case 'place_bench_unit':
    case 'swap_bench_with_field':
    case 'move_field_unit':
    case 'move_field_unit_to_bench':
    case 'return_field_unit_to_bench':
    case 'swap_field_units':
      if (currentPhase.type !== 'battle') return null;
      return currentPhase; // applyActionSideEffects mutates BattleState; rebuildPhaseSnapshot refreshes phase

    // ── Battle turn (mutation-only) ───────────────────────────────────────
    case 'battle_start_turn':
    case 'battle_select_skill':
    case 'battle_use_skill':
    case 'battle_advance_turn':
    case 'battle_skip_turn':
    case 'battle_charge_turn':
    case 'battle_quick_turn':
    case 'battle_decide_auto_turn':
    case 'battle_apply_auto_turn':
      if (currentPhase.type !== 'battle') return null;
      return currentPhase; // applyActionSideEffects mutates state; rebuildPhaseSnapshot refreshes phase

    // ── Battle preview target (mutation-only) ──────────────────────────────
    case 'battle_preview_target':
    case 'battle_clear_preview_target':
      if (currentPhase.type !== 'battle') return null;
      return currentPhase; // applyActionSideEffects mutates BattleState; rebuildPhaseSnapshot refreshes phase
  }
}

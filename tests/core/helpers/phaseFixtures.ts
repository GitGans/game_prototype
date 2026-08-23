import type { GamePhase } from '../../../src/core/phases';

/**
 * Minimal, snapshot-free GamePhase literals for tests that exercise the read-side
 * pipeline (metadata derivation, snapshot dispatch, battle projection).
 *
 * Every snapshot-bearing field starts empty on purpose: these fixtures stand in for
 * the placeholders `phaseTransitionResolver` produces, so a test that expects a value
 * to be rebuilt from authoritative state cannot accidentally pass because the fixture
 * already carried it.
 */

type WorldMapPhase = Extract<GamePhase, { type: 'world_map' }>;
type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

export function makeWorldMapPhase(overrides: Partial<WorldMapPhase> = {}): WorldMapPhase {
  return {
    type: 'world_map',
    mapId: '',
    partyPos: { x: 0, y: 0 },
    mapState: { entityStates: {} },
    selectedForBattleUnitCount: 0,
    activeLivingUnitCount: 0,
    canStartBattle: false,
    ...overrides,
  };
}

export function makeBattlePhase(overrides: Partial<BattlePhase> = {}): BattlePhase {
  return {
    type: 'battle',
    sessionSource: 'campaign',
    enemyGroupId: 'test_enemies',
    returnPhase: makeWorldMapPhase(),
    triggerPos: undefined,
    mapId: undefined,
    participants: [],
    benchUnits: [],
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
    battlePhase: 'placement',
    canBeginCombat: false,
    fieldUnits: [],
    unitsById: new Map(),
    occupancy: { cellToUnitId: new Map(), unitToCells: new Map() },
    fieldUnitCells: { cellToUnitIds: new Map(), unitToCells: new Map() },
    roundQueue: [],
    activeUnitId: null,
    activeUnit: null,
    battleMode: 'manual',
    activeUnitSide: null,
    manualTurnControlsVisible: false,
    manualChargeDisabled: false,
    validTargets: [],
    targetHighlightKind: 'none',
    previewTargetCoord: null,
    previewTargetUnitId: null,
    ...overrides,
  };
}

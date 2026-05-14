import { BENCH_SLOTS }                          from './Constants';
import type { Rng }                             from '../shared/random';
import { pickOne }                              from '../shared/random';
import { ENEMY_GROUPS }                         from '../data/enemyGroupDefinitions';
import {
  buildPlayerAutoPlacementCandidates,
  buildEnemyPlacementCandidates,
  buildEnemyReplayInputs,
}                                               from './battleSetupProjection';
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  replayPlaceEnemies,
}                                               from '../battle/autoPlace';
import type { BattleState }                     from '../battle/types';
import type { UnitRace }                        from '../shared/unitTypes';
import type { PlayerBattleSetup }               from './battleSetup';
import type { CellCoord }                       from '../shared/gridTypes';
import { getFieldUnits, requireFieldDeployment } from '../battle/deployment';

export interface EnemyPlacementRecord {
  templateId: string;
  anchor:     CellCoord;
  level:      number;
}

export interface BattleInitResult {
  state:           BattleState;
  race:            UnitRace;
  enemyPlacements: EnemyPlacementRecord[];
}

const FALLBACK_RACES: UnitRace[] = ['orc', 'demon', 'undead'];

/**
 * Builds a fresh BattleState for a new battle (campaign or debug).
 * Places player units from setup, generates enemy units from enemyGroupId.
 * Uses rng for race selection when group has no forceRace.
 */
export function buildNewBattleState(
  emptyState:   BattleState,
  setup:        PlayerBattleSetup,
  enemyGroupId: string,
  rng:          Rng,
): BattleInitResult {
  // 1. Place player units
  const playerCandidates = buildPlayerAutoPlacementCandidates(setup);
  let state = autoPlacePlayer(emptyState, playerCandidates, BENCH_SLOTS);

  // Seed nextPlayerId from placed units so manual placement IDs don't collide
  const maxP = [...state.units.keys()]
    .filter(id => id.startsWith('p'))
    .reduce((max, id) => Math.max(max, parseInt(id.slice(1), 10) || 0), 0);
  state = { ...state, nextPlayerId: maxP + 1 };

  // 2. Determine enemy race and level
  // Use field-deployed player units only — bench units should not inflate enemy difficulty.
  const group       = ENEMY_GROUPS[enemyGroupId];
  const playerMaxLv = getFieldUnits(state)
    .filter(u => u.side === 'player' && u.hp > 0)
    .reduce((max, u) => Math.max(max, u.level), 1);
  const race  = group?.race          ?? pickOne(rng, FALLBACK_RACES);
  const level = group?.levelOverride ?? playerMaxLv;

  // 3. Place enemy units
  const enemyCandidates = buildEnemyPlacementCandidates(race, level);
  state = autoPlaceEnemies(state, enemyCandidates, rng);

  // 4. Capture placement records for replay (enemies are always field-deployed)
  const enemyPlacements: EnemyPlacementRecord[] = [...state.units.values()]
    .filter(u => u.side === 'enemy')
    .map(u => ({
      templateId: u.templateId,
      anchor:     requireFieldDeployment(state, u.id).anchor,
      level:      u.level,
    }));

  return { state, race, enemyPlacements };
}

/**
 * Rebuilds a BattleState for a replay: fresh player placement,
 * deterministic enemy placement from previously saved records.
 */
export function buildReplayBattleState(
  emptyState:      BattleState,
  setup:           PlayerBattleSetup,
  savedPlacements: EnemyPlacementRecord[],
): BattleState {
  const playerCandidates = buildPlayerAutoPlacementCandidates(setup);
  let state = autoPlacePlayer(emptyState, playerCandidates, BENCH_SLOTS);

  const maxP = [...state.units.keys()]
    .filter(id => id.startsWith('p'))
    .reduce((max, id) => Math.max(max, parseInt(id.slice(1), 10) || 0), 0);
  state = { ...state, nextPlayerId: maxP + 1 };

  const replayInputs = buildEnemyReplayInputs(savedPlacements);
  return replayPlaceEnemies(state, replayInputs);
}

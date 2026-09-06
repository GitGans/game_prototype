import { BENCH_SLOTS }                          from './Constants';
import type { Rng }                             from '../shared/random';
import { pickOne }                              from '../shared/random';
import { ENEMY_GROUPS }                         from '../data/enemyGroupDefinitions';
import {
  buildEnemyPlacementCandidates,
  buildEnemyReplayInputs,
}                                               from './battleSetupProjection';
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  replayPlaceEnemies,
}                                               from '../battle/autoPlace';
import type { PlayerInitialPlacement }          from '../battle/autoPlace';
import type { BattleState }                     from '../battle/types';
import type { UnitRace }                        from '../shared/unitTypes';
import type { PlayerBattleSetup }               from './battleSetup';
import { getFieldUnits, requireFieldDeployment } from '../battle/deployment';
import { isAlive } from '../battle/lifeState';
import type { EnemyReplayPlacement } from './battleRuntimeContext';

export interface BattleInitResult {
  state:            BattleState;
  enemyPlacements:  EnemyReplayPlacement[];
  playerPlacements: PlayerInitialPlacement[];
}

export interface BattleReplayInitResult {
  state:            BattleState;
  playerPlacements: PlayerInitialPlacement[];
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
  // 1. Place player units — before any enemy RNG is consumed.
  const playerResult = autoPlacePlayer(emptyState, setup, BENCH_SLOTS);
  let state = playerResult.state;

  // Seed nextPlayerId from placed units so manual placement IDs don't collide.
  // Dead units stay in state.units after Stage 2, so this seed is monotonic.
  const maxP = [...state.units.keys()]
    .filter(id => id.startsWith('p'))
    .reduce((max, id) => Math.max(max, parseInt(id.slice(1), 10) || 0), 0);
  state = { ...state, nextPlayerId: maxP + 1 };

  // 2. Determine enemy race and level
  // Use LIVING field-deployed player units only — bench units should not inflate
  // enemy difficulty, and corpses are not combatants. Living-first placement plus
  // the "at least one living selected unit" entry rule guarantee a living field
  // unit here; the `1` floor stays only as a defensive fallback.
  const group       = ENEMY_GROUPS[enemyGroupId];
  const playerMaxLv = getFieldUnits(state)
    .filter(u => u.side === 'player' && isAlive(u))
    .reduce((max, u) => Math.max(max, u.level), 1);
  const race  = group?.race          ?? pickOne(rng, FALLBACK_RACES);
  const level = group?.levelOverride ?? playerMaxLv;

  // 3. Place enemy units
  const enemyCandidates = buildEnemyPlacementCandidates(race, level);
  state = autoPlaceEnemies(state, enemyCandidates, rng);

  // 4. Capture placement records for replay (enemies are always field-deployed)
  const enemyPlacements: EnemyReplayPlacement[] = [...state.units.values()]
    .filter(u => u.side === 'enemy')
    .map(u => ({
      templateId: u.templateId,
      anchor:     requireFieldDeployment(state, u.id).anchor,
      level:      u.level,
    }));

  return { state, enemyPlacements, playerPlacements: playerResult.placements };
}

/**
 * Rebuilds a BattleState for a replay attempt: player units are auto-placed from a
 * freshly projected setup, enemies are restored deterministically from the captured
 * placement records. The returned placement records are the initial-deployment truth
 * for this attempt — participants must be rebuilt from them, never carried over from
 * the previous attempt.
 */
export function buildReplayBattleState(
  emptyState:      BattleState,
  setup:           PlayerBattleSetup,
  savedPlacements: readonly EnemyReplayPlacement[],
): BattleReplayInitResult {
  const playerResult = autoPlacePlayer(emptyState, setup, BENCH_SLOTS);
  let state = playerResult.state;

  const maxP = [...state.units.keys()]
    .filter(id => id.startsWith('p'))
    .reduce((max, id) => Math.max(max, parseInt(id.slice(1), 10) || 0), 0);
  state = { ...state, nextPlayerId: maxP + 1 };

  const replayInputs = buildEnemyReplayInputs(savedPlacements);
  return {
    state:            replayPlaceEnemies(state, replayInputs),
    playerPlacements: playerResult.placements,
  };
}

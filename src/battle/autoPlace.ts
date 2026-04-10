import { BattleState, CellCoord, Col, Row, Unit, UnitBlueprint, UnitRace } from './types';
import { canPlace, placeUnit } from './placement';
import { cellKey } from './field';
import { PLAYER_UNITS, PLAYER_STARTING_IDS, ENEMY_UNITS } from '../data/unitDefinitions';
import { BENCH_SLOTS } from '../core/Constants';
import { GameState } from '../core/GameState';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { getEquippedBonuses } from './itemOps';

export function getPlayerAverageLevel(state: BattleState): number {
  const playerUnits = [...state.units.values()].filter(u => u.id.startsWith('p'));
  if (playerUnits.length === 0) return 1;
  const total = playerUnits.reduce((sum, u) => sum + u.level, 0);
  return Math.round(total / playerUnits.length);
}

export function createUnitInstance(
  blueprint: UnitBlueprint,
  id: string,
  anchor: CellCoord,
  levelOverride?: number,
): Unit {
  const level = levelOverride ?? blueprint.level;
  const scale = 1 + 0.1 * (level - 1);

  // Base stats scaled by level
  const scaledHp         = Math.round(blueprint.hp * scale);
  const scaledPhysDmg    = Math.round(blueprint.physicalDamage * scale);
  const scaledMagicDmg   = Math.round(blueprint.magicalDamage * scale);
  const scaledHealAmount = Math.round(blueprint.healAmount * scale);

  // Flat bonuses from equipped items (returns {} for enemies — no containers)
  const bonuses = getEquippedBonuses(
    blueprint.templateId,
    GameState.itemContainers,
    GameState.itemInstances,
    ITEM_DEFINITIONS,
  );

  return {
    id,
    name:            blueprint.name,
    hp:              scaledHp         + (bonuses.hp              ?? 0),
    maxHp:           scaledHp         + (bonuses.hp              ?? 0),
    physicalDamage:  scaledPhysDmg    + (bonuses.physicalDamage  ?? 0),
    magicalDamage:   scaledMagicDmg   + (bonuses.magicalDamage   ?? 0),
    physicalDefense: blueprint.physicalDefense + (bonuses.physicalDefense ?? 0),
    magicalDefense:  blueprint.magicalDefense  + (bonuses.magicalDefense  ?? 0),
    healAmount:      scaledHealAmount  + (bonuses.healAmount      ?? 0),
    level,
    initiative:  blueprint.initiative,
    shape:       blueprint.shape,
    anchor,
    actionType:  blueprint.actionType,
    skill:       blueprint.skill,
    rowTrait:    blueprint.rowTrait,
    race:        blueprint.race,
    templateId:  blueprint.templateId,
  };
}

export function blueprintFromUnit(unit: Unit): UnitBlueprint {
  const allBlueprints = [
    ...PLAYER_UNITS,
    ...Object.values(ENEMY_UNITS).flat(),
  ];
  const originalBp = allBlueprints.find(b => b.templateId === unit.templateId)!;
  return {
    ...originalBp,       // unscaled base stats from static definition
    level: unit.level,   // preserve current level
  };
}

export function autoPlacePlayer(state: BattleState): BattleState {
  const savedBenchIds = GameState.playerBenchIds;
  const campIds = GameState.campUnitIds;
  const availableUnits = PLAYER_UNITS.filter(u => !campIds.includes(u.templateId));

  const startingDefs = savedBenchIds !== null
    ? availableUnits.filter(u => !savedBenchIds.includes(u.templateId))
    : availableUnits.filter(u => PLAYER_STARTING_IDS.includes(u.templateId));

  const benchDefs = savedBenchIds !== null
    ? availableUnits.filter(u => savedBenchIds.includes(u.templateId))
    : availableUnits.filter(u => !PLAYER_STARTING_IDS.includes(u.templateId));

  const frontUnits = startingDefs.filter(d => d.rowTrait === 'front');
  const backUnits  = startingDefs.filter(d => d.rowTrait === 'back');

  let counter = 1;
  const cols: Col[] = [0, 1, 2];
  const saved = GameState.playerUnitPlacements;

  const tryPlace = (def: UnitBlueprint, fallbackRow: Row): void => {
    const level = GameState.playerUnitLevels[def.templateId] ?? def.level;
    const savedAnchor = saved[def.templateId];

    // Try saved position first
    if (savedAnchor && canPlace(savedAnchor, def.shape, state, 'player')) {
      state = placeUnit(createUnitInstance(def, `p${counter++}`, savedAnchor, level), state);
      return;
    }

    // Fall back to auto-placement
    for (const col of cols) {
      const anchor: CellCoord = { side: 'player', row: fallbackRow, col };
      if (canPlace(anchor, def.shape, state, 'player')) {
        state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor, level), state);
        return;
      }
    }
  };

  for (const def of frontUnits) tryPlace(def, 0);
  for (const def of backUnits)  tryPlace(def, 1);

  const paddedBench: (UnitBlueprint | undefined)[] = Array(BENCH_SLOTS).fill(undefined);
  benchDefs.forEach((bp, i) => { if (i < BENCH_SLOTS) paddedBench[i] = bp; });
  return { ...state, benchUnits: paddedBench };
}

export function autoPlaceEnemies(
  state: BattleState,
  playerAvgLevel: number = 1,
  forceRace?: UnitRace,
): BattleState {
  const races: UnitRace[] = ['orc', 'demon', 'undead'];
  const race = forceRace ?? races[Math.floor(Math.random() * races.length)];
  GameState.lastEnemyRace = race;

  const raceUnits = ENEMY_UNITS[race];

  const frontPool = raceUnits.filter(d => d.rowTrait === 'front');
  const backPool  = raceUnits.filter(d => d.rowTrait === 'back');

  let counter = 1;
  const cols: Col[] = [0, 1, 2];

  // Fill front row
  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 0, col };
    if (state.occupancy.cellToUnit.has(cellKey(anchor))) continue;
    if (frontPool.length === 0) continue;
    const def = frontPool[Math.floor(Math.random() * frontPool.length)];
    const unit = createUnitInstance(def, `e${counter++}`, anchor, playerAvgLevel);
    if (canPlace(anchor, def.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }

  // Fill remaining back row cells
  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 1, col };
    if (state.occupancy.cellToUnit.has(cellKey(anchor))) continue;
    if (backPool.length === 0) continue;
    const def = backPool[Math.floor(Math.random() * backPool.length)];
    const unit = createUnitInstance(def, `e${counter++}`, anchor, playerAvgLevel);
    if (canPlace(anchor, def.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }

  return state;
}

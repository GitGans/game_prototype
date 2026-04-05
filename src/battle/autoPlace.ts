import { BattleState, CellCoord, Col, Unit, UnitBlueprint, UnitRace } from './types';
import { canPlace, placeUnit } from './placement';
import { cellKey } from './field';
import { PLAYER_UNITS, PLAYER_STARTING_IDS, ENEMY_UNITS } from '../data/unitDefinitions';

export function createUnitInstance(blueprint: UnitBlueprint, id: string, anchor: CellCoord): Unit {
  return {
    id,
    name: blueprint.name,
    hp: blueprint.hp,
    maxHp: blueprint.hp,
    initiative: blueprint.initiative,
    shape: blueprint.shape,
    anchor,
    actionType: blueprint.actionType,
    rowTrait: blueprint.rowTrait,
    race: blueprint.race,
    templateId: blueprint.templateId,
  };
}

export function blueprintFromUnit(unit: Unit): UnitBlueprint {
  return {
    templateId: unit.templateId,
    name: unit.name,
    hp: unit.maxHp,
    initiative: unit.initiative,
    shape: unit.shape,
    actionType: unit.actionType,
    rowTrait: unit.rowTrait,
    race: unit.race,
  };
}

export function autoPlacePlayer(state: BattleState): BattleState {
  const startingDefs = PLAYER_STARTING_IDS
    .map(id => PLAYER_UNITS.find(u => u.templateId === id))
    .filter((u): u is UnitBlueprint => u !== undefined);

  const benchDefs = PLAYER_UNITS.filter(u => !PLAYER_STARTING_IDS.includes(u.templateId));

  const frontUnits = startingDefs.filter(d => d.rowTrait === 'front');
  const backUnits  = startingDefs.filter(d => d.rowTrait === 'back');

  let counter = 1;
  const cols: Col[] = [0, 1, 2];

  for (const def of frontUnits) {
    for (const col of cols) {
      const anchor: CellCoord = { side: 'player', row: 0, col };
      if (canPlace(anchor, def.shape, state, 'player')) {
        state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor), state);
        break;
      }
    }
  }

  for (const def of backUnits) {
    for (const col of cols) {
      const anchor: CellCoord = { side: 'player', row: 1, col };
      if (canPlace(anchor, def.shape, state, 'player')) {
        state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor), state);
        break;
      }
    }
  }

  return { ...state, benchUnits: benchDefs };
}

export function autoPlaceEnemies(state: BattleState): BattleState {
  const races: UnitRace[] = ['orc', 'demon', 'undead'];
  const race = races[Math.floor(Math.random() * races.length)];
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
    const unit = createUnitInstance(def, `e${counter++}`, anchor);
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
    const unit = createUnitInstance(def, `e${counter++}`, anchor);
    if (canPlace(anchor, def.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }

  return state;
}

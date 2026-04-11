import { BattleState, CellCoord, Col, Row, Unit, UnitBlueprint, UnitRace } from './types';
import { canPlace, placeUnit } from './placement';
import { cellKey } from './field';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/unitDefinitions';
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
    dodge:           blueprint.dodge,
    block:           blueprint.block,
    level,
    initiative:  blueprint.initiative,
    shape:       blueprint.shape,
    anchor,
    skill:         blueprint.skill,
    rowTrait:      blueprint.rowTrait,
    race:          blueprint.race,
    templateId:    blueprint.templateId,
    activeEffects: [],
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
  const campIds        = GameState.campUnitIds;
  const savedBenchIds  = GameState.playerBenchIds;
  const saved          = GameState.playerUnitPlacements;
  const availableUnits = PLAYER_UNITS.filter(u => !campIds.includes(u.templateId));

  let counter = 1;
  const paddedBench: (UnitBlueprint | undefined)[] = Array(BENCH_SLOTS).fill(undefined);

  // Returns true if a bench slot was free and the unit was added.
  const addToBench = (def: UnitBlueprint): boolean => {
    const slot = paddedBench.indexOf(undefined);
    if (slot === -1) return false;
    paddedBench[slot] = def;
    return true;
  };

  // Returns true if the unit was placed on the field.
  const tryPlaceOnField = (def: UnitBlueprint): boolean => {
    const level = GameState.playerUnitLevels[def.templateId] ?? def.level;
    // 1. Try saved position
    const savedAnchor = saved[def.templateId];
    if (savedAnchor && canPlace(savedAnchor, def.shape, state, 'player')) {
      state = placeUnit(createUnitInstance(def, `p${counter++}`, savedAnchor, level), state);
      return true;
    }
    // 2. Auto-placement: preferred row first, then the other row
    const rows: Row[] = def.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) {
        const anchor: CellCoord = { side: 'player', row, col };
        if (canPlace(anchor, def.shape, state, 'player')) {
          state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor, level), state);
          return true;
        }
      }
    }
    return false;
  };

  const toField: UnitBlueprint[] = [];
  const toBench: UnitBlueprint[] = [];

  for (const def of availableUnits) {
    if (savedBenchIds !== null && savedBenchIds.includes(def.templateId)) {
      toBench.push(def);   // was on bench last battle → restore to bench
    } else {
      toField.push(def);   // was on field (or first battle) → try field
    }
  }

  // Place field units; failures spill into the bench queue
  for (const def of toField) {
    if (!tryPlaceOnField(def)) toBench.push(def);
  }

  // Fill bench; overflow goes to field
  for (const def of toBench) {
    if (!addToBench(def)) tryPlaceOnField(def);
  }

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

import { BattleState, CellCoord, Col, Row, Unit, UnitBlueprint, UnitRace, ItemInstance, ItemContainer, BattleStatBonuses } from './types';
import { canPlace, placeUnit } from './placement';
import { cellKey } from './field';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/unitDefinitions';
import { BENCH_SLOTS } from '../core/Constants';
import { GameState } from '../core/GameState';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { computeUnitBattleStats, snapshotActivatableAbilities } from './itemOps';

export interface PlayerBattleSetup {
  unitLevels: Record<string, number>;
  campUnitIds: string[];
  itemContainers: Record<string, ItemContainer>;
  itemInstances: Record<string, ItemInstance>;
  playerUnitPlacements: Record<string, CellCoord>;
  playerBenchIds: string[] | null;
  unitPermanentBonuses: Record<string, Partial<BattleStatBonuses>>;
}

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
  setup?: Pick<PlayerBattleSetup, 'itemContainers' | 'itemInstances' | 'unitPermanentBonuses'>,
): Unit {
  const level = levelOverride ?? blueprint.level;
  const containers = setup?.itemContainers ?? GameState.itemContainers;
  const instances  = setup?.itemInstances  ?? GameState.itemInstances;
  const bonuses    = setup?.unitPermanentBonuses ?? GameState.unitPermanentBonuses;
  const stats = computeUnitBattleStats(
    blueprint, level,
    containers,
    instances,
    ITEM_DEFINITIONS,
    bonuses,
  );
  const activatableAbilities = snapshotActivatableAbilities(
    blueprint.templateId,
    containers,
    instances,
    ITEM_DEFINITIONS,
  );

  return {
    id,
    name:                blueprint.name,
    hp:                  stats.hp,
    maxHp:               stats.hp,
    physicalDamage:      stats.physicalDamage,
    magicalDamage:       stats.magicalDamage,
    physicalDefense:     stats.physicalDefense,
    magicalDefense:      stats.magicalDefense,
    dodge:               blueprint.dodge,
    block:               blueprint.block,
    level,
    initiative:          blueprint.initiative,
    shape:               blueprint.shape,
    anchor,
    skills:              blueprint.skills,
    activeSkillIndex:    0,
    rowTrait:            blueprint.rowTrait,
    race:                blueprint.race,
    templateId:          blueprint.templateId,
    activeEffects:       [],
    activatableAbilities,
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

export function autoPlacePlayer(state: BattleState, setup?: PlayerBattleSetup): BattleState {
  const campIds        = setup?.campUnitIds        ?? GameState.campUnitIds;
  const savedBenchIds  = setup?.playerBenchIds     ?? GameState.playerBenchIds;
  const saved          = setup?.playerUnitPlacements ?? GameState.playerUnitPlacements;
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
    const levelMap = setup?.unitLevels ?? GameState.playerUnitLevels;
    const level = levelMap[def.templateId] ?? def.level;
    // 1. Try saved position
    const savedAnchor = saved[def.templateId];
    if (savedAnchor && canPlace(savedAnchor, def.shape, state, 'player')) {
      state = placeUnit(createUnitInstance(def, `p${counter++}`, savedAnchor, level, setup), state);
      return true;
    }
    // 2. Auto-placement: preferred row first, then the other row
    const rows: Row[] = def.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) {
        const anchor: CellCoord = { side: 'player', row, col };
        if (canPlace(anchor, def.shape, state, 'player')) {
          state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor, level, setup), state);
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

export function replayPlaceEnemies(
  state: BattleState,
  savedPlacements: Array<{ templateId: string; anchor: CellCoord; level: number }>,
): BattleState {
  const allEnemyBlueprints = Object.values(ENEMY_UNITS).flat();
  let counter = 1;
  for (const saved of savedPlacements) {
    const blueprint = allEnemyBlueprints.find(b => b.templateId === saved.templateId);
    if (!blueprint) continue;
    const unit = createUnitInstance(blueprint, `e${counter++}`, saved.anchor, saved.level);
    if (canPlace(saved.anchor, blueprint.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }
  return state;
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

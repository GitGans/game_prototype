import { BattleState, CellCoord, Col, Row, Skill, Unit, UnitBlueprint, UnitRace, ItemInstance, ItemContainer } from './types';
import { canPlace, placeUnit } from './placement';
import { cellKey } from './field';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/unitDefinitions';
import { BENCH_SLOTS } from '../core/Constants';
import { GameState, PlayerUnitState } from '../core/GameState';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { computeUnitBattleStats, snapshotActivatableAbilities } from './itemOps';

export interface PlayerBattleSetup {
  playerUnits: Record<string, PlayerUnitState>;
  itemContainers: Record<string, ItemContainer>;
  itemInstances: Record<string, ItemInstance>;
}

function resolvePlayerSkills(blueprint: UnitBlueprint, unitState: PlayerUnitState): Skill[] {
  const skills: Skill[] = [];
  if (blueprint.baseSkill) skills.push(blueprint.baseSkill);
  for (const tier of (blueprint.upgradeTiers ?? [])) {
    const chosenId = unitState.chosenUpgrades[tier.unlocksAtLevel];
    if (!chosenId) continue;
    const upgrade = tier.options.find(upg => upg.id === chosenId);
    if (upgrade?.skill) skills.push(upgrade.skill);
  }
  return skills;
}

function resolveEnemySkills(blueprint: UnitBlueprint, level: number): Skill[] {
  const base = (blueprint.skillTiers ?? [])
    .filter(t => t.unlocksAtLevel === 0)
    .flatMap(t => t.options.slice(0, 1));
  const leveled = (blueprint.levelSkills ?? [])
    .filter(ls => ls.unlocksAtLevel <= level)
    .map(ls => ls.skill);
  return [...base, ...leveled];
}

export function createUnitInstance(
  blueprint: UnitBlueprint,
  id: string,
  anchor: CellCoord,
  levelOverride?: number,
  setup?: Pick<PlayerBattleSetup, 'itemContainers' | 'itemInstances'> & {
    unitState?: PlayerUnitState;
  },
): Unit {
  const level = levelOverride ?? setup?.unitState?.level ?? blueprint.level;
  const containers = setup?.itemContainers ?? GameState.itemContainers;
  const instances  = setup?.itemInstances  ?? GameState.itemInstances;
  const bonuses    = setup?.unitState?.permanentBonuses ?? {};
  const stats = computeUnitBattleStats(
    blueprint, level,
    containers,
    instances,
    ITEM_DEFINITIONS,
    { [blueprint.templateId]: bonuses },
  );
  const activatableAbilities = setup?.unitState
    ? snapshotActivatableAbilities(blueprint.templateId, containers, instances, ITEM_DEFINITIONS)
    : [];

  const skills = setup?.unitState
    ? resolvePlayerSkills(blueprint, setup.unitState)
    : resolveEnemySkills(blueprint, level);

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
    skills,
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
    ...originalBp,
    level: unit.level,
  };
}

export function getPlayerMaxLevel(playerUnits: Record<string, PlayerUnitState>): number {
  const levels = Object.values(playerUnits).map(u => u.level);
  return levels.length > 0 ? Math.max(...levels) : 1;
}

export function autoPlacePlayer(state: BattleState, setup?: PlayerBattleSetup): BattleState {
  const playerUnitsState = setup?.playerUnits ?? GameState.playerUnits;
  const availableUnits = PLAYER_UNITS.filter(u => !playerUnitsState[u.templateId]?.isInCamp);

  let counter = 1;
  const paddedBench: (UnitBlueprint | undefined)[] = Array(BENCH_SLOTS).fill(undefined);

  const addToBench = (def: UnitBlueprint): boolean => {
    const slot = paddedBench.indexOf(undefined);
    if (slot === -1) return false;
    paddedBench[slot] = def;
    return true;
  };

  const tryPlaceOnField = (def: UnitBlueprint): boolean => {
    const unitState = playerUnitsState[def.templateId];
    const level = unitState?.level ?? def.level;
    const instanceSetup = {
      itemContainers: setup?.itemContainers ?? GameState.itemContainers,
      itemInstances: setup?.itemInstances ?? GameState.itemInstances,
      unitState,
    };

    // 1. Try saved position
    const savedAnchor = unitState?.lastPlacement ?? null;
    if (savedAnchor && canPlace(savedAnchor, def.shape, state, 'player')) {
      state = placeUnit(createUnitInstance(def, `p${counter++}`, savedAnchor, level, instanceSetup), state);
      return true;
    }
    // 2. Auto-placement: preferred row first, then the other row
    const rows: Row[] = def.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) {
        const anchor: CellCoord = { side: 'player', row, col };
        if (canPlace(anchor, def.shape, state, 'player')) {
          state = placeUnit(createUnitInstance(def, `p${counter++}`, anchor, level, instanceSetup), state);
          return true;
        }
      }
    }
    return false;
  };

  const toField: UnitBlueprint[] = [];
  const toBench: UnitBlueprint[] = [];

  for (const def of availableUnits) {
    toField.push(def);
  }

  for (const def of toField) {
    if (!tryPlaceOnField(def)) toBench.push(def);
  }

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
  playerMaxLevel: number = 1,
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

  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 0, col };
    if (state.occupancy.cellToUnit.has(cellKey(anchor))) continue;
    if (frontPool.length === 0) continue;
    const def = frontPool[Math.floor(Math.random() * frontPool.length)];
    const unit = createUnitInstance(def, `e${counter++}`, anchor, playerMaxLevel);
    if (canPlace(anchor, def.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }

  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 1, col };
    if (state.occupancy.cellToUnit.has(cellKey(anchor))) continue;
    if (backPool.length === 0) continue;
    const def = backPool[Math.floor(Math.random() * backPool.length)];
    const unit = createUnitInstance(def, `e${counter++}`, anchor, playerMaxLevel);
    if (canPlace(anchor, def.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }

  return state;
}

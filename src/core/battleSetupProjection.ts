import { PLAYER_UNITS, ENEMY_UNITS }      from '../data/units';
import {
  resolvePlayerUnitSpriteSheet,
  getEnemyUnitSpriteSheet,
  findEnemyUnitBlueprintWithRace,
} from './unitSprites';
import { ITEM_DEFINITIONS }               from '../data/itemDefinitions';
import { getEquippedBonuses, snapshotActivatableAbilities } from '../inventory';
import { resolveUnitProgression, resolveUnitBattleStats } from '../progression';
import { createUnitInstance } from '../battle/unitFactory';
import type { PlayerBattleSetup }         from './battleSetup';
import type { PlayerPlacementCandidate, EnemyPlacementCandidates, EnemyReplayPlacementInput } from '../battle/autoPlace';
import type { UnitBlueprint, UnitRace, UpgradeOptionId } from '../shared/unitTypes';
import type { ActionSkillDefinition }      from '../shared/skillDefinitionTypes';
import { resolveSkillDefinition }          from '../progression';
import type { CellCoord }                 from '../shared/gridTypes';
import type { ItemContainer, ItemInstance, BattleStatBonuses } from '../shared/itemTypes';
import {
  isPersistentPlayerUnitAlive,
  getPersistentCurrentHp,
  clampAliveCurrentHp,
} from './playerUnitPersistence';

function resolveEnemySkills(blueprint: UnitBlueprint, level: number): ActionSkillDefinition[] {
  return (blueprint.enemySkillUnlocks ?? [])
    .filter(u => u.unlocksAtLevel <= level)
    .map(u => resolveSkillDefinition(u.skillId));
}

export function buildPlayerAutoPlacementCandidates(
  setup: PlayerBattleSetup,
  blueprints: readonly UnitBlueprint[] = PLAYER_UNITS,
): PlayerPlacementCandidate[] {
  return blueprints
    .filter(bp => {
      const us = setup.playerUnits[bp.templateId];
      return !us?.isInCamp && isPersistentPlayerUnitAlive(us);
    })
    .map(bp => {
      const unitState = setup.playerUnits[bp.templateId];
      // unitState must exist for every non-camp unit (initialized at new_game)
      const level       = unitState?.level ?? bp.level;
      const progression = resolveUnitProgression(bp, unitState?.chosenUpgrades ?? {});
      const equipmentBonuses = getEquippedBonuses(
        bp.templateId, setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
      );
      const stats       = resolveUnitBattleStats({
        blueprint:        bp,
        level,
        upgradeModifiers: progression.statModifiers,
        equipmentBonuses,
        permanentBonuses: unitState?.permanentBonuses ?? {},
      });
      const activatableAbilities = snapshotActivatableAbilities(
        bp.templateId,
        setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
      );
      const initialHp = clampAliveCurrentHp(
        getPersistentCurrentHp(unitState),
        stats.hp,
      );
      return {
        templateId:  bp.templateId,
        shape:       bp.shape,
        rowTrait:    bp.rowTrait,
        savedAnchor: unitState?.lastPlacement ?? null,
        createUnit:  (id: string) => createUnitInstance({
          blueprint: bp, id, side: 'player', level,
          classId:              progression.currentClassId,
          stats,
          skills:               progression.skills,
          spriteSheet:          resolvePlayerUnitSpriteSheet(bp, progression),
          activatableAbilities,
          initialHp,
        }),
      };
    });
}

export function resolvePlayerMaxHpForLevel(input: {
  blueprint: UnitBlueprint;
  level: number;
  chosenUpgrades: Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>;
  permanentBonuses: Partial<BattleStatBonuses>;
  itemContainers: Record<string, ItemContainer>;
  itemInstances: Record<string, ItemInstance>;
}): number {
  const progression = resolveUnitProgression(input.blueprint, input.chosenUpgrades);
  const equipmentBonuses = getEquippedBonuses(
    input.blueprint.templateId, input.itemContainers, input.itemInstances, ITEM_DEFINITIONS,
  );
  const stats = resolveUnitBattleStats({
    blueprint:        input.blueprint,
    level:            input.level,
    upgradeModifiers: progression.statModifiers,
    equipmentBonuses,
    permanentBonuses: input.permanentBonuses,
  });
  return stats.hp;
}

export function buildEnemyPlacementCandidates(
  race:  UnitRace,
  level: number,
): EnemyPlacementCandidates {
  const raceUnits = ENEMY_UNITS[race];

  const toCandidate = (bp: UnitBlueprint) => {
    const skills = resolveEnemySkills(bp, level);
    const stats  = resolveUnitBattleStats({ blueprint: bp, level });
    return {
      templateId: bp.templateId,
      shape:      bp.shape,
      rowTrait:   bp.rowTrait,
      createUnit: (id: string) => createUnitInstance({
        blueprint: bp, id, side: 'enemy', level,
        classId:              bp.baseClassId,
        stats, skills,
        spriteSheet:          bp.spriteFilename
          ? getEnemyUnitSpriteSheet(race, bp.spriteFilename)
          : undefined,
        activatableAbilities: [],
      }),
    };
  };

  return {
    frontPool: raceUnits.filter(bp => bp.rowTrait === 'front').map(toCandidate),
    backPool:  raceUnits.filter(bp => bp.rowTrait === 'back').map(toCandidate),
  };
}

export function buildEnemyReplayInputs(
  savedPlacements: Array<{ templateId: string; anchor: CellCoord; level: number }>,
): EnemyReplayPlacementInput[] {
  let counter = 1;
  const result: EnemyReplayPlacementInput[] = [];
  for (const saved of savedPlacements) {
    const found = findEnemyUnitBlueprintWithRace(saved.templateId);
    if (!found) continue;
    const { blueprint: bp, race: bpRace } = found;
    const skills = resolveEnemySkills(bp, saved.level);
    const stats  = resolveUnitBattleStats({ blueprint: bp, level: saved.level });
    result.push({
      unitInput: {
        blueprint:            bp,
        id:                   `e${counter++}`,
        side:                 'enemy',
        level:                saved.level,
        classId:              bp.baseClassId,
        stats, skills,
        spriteSheet:          bp.spriteFilename
          ? getEnemyUnitSpriteSheet(bpRace, bp.spriteFilename)
          : undefined,
        activatableAbilities: [],
      },
      anchor: saved.anchor,
    });
  }
  return result;
}


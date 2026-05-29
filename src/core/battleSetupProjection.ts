import { PLAYER_UNITS, ENEMY_UNITS }      from '../data/units';
import {
  resolvePlayerUnitSpriteSheet,
  getEnemyUnitSpriteSheet,
  findEnemyUnitBlueprintWithRace,
} from './unitSprites';
import { ITEM_DEFINITIONS }               from '../data/itemDefinitions';
import { computeUnitBattleStats, snapshotActivatableAbilities } from '../battle/itemOps';
import { resolveUnitProgression }         from '../progression';
import { createUnitInstance } from '../battle/unitFactory';
import type { PlayerBattleSetup }         from './battleSetup';
import type { PlayerPlacementCandidate, EnemyPlacementCandidates, EnemyReplayPlacementInput } from '../battle/autoPlace';
import type { UnitBlueprint, UnitRace }   from '../shared/unitTypes';
import type { ActionSkillDefinition }      from '../shared/skillDefinitionTypes';
import { resolveSkillDefinition }          from '../progression';
import type { CellCoord }                 from '../shared/gridTypes';

function resolveEnemySkills(blueprint: UnitBlueprint, level: number): ActionSkillDefinition[] {
  return (blueprint.enemySkillUnlocks ?? [])
    .filter(u => u.unlocksAtLevel <= level)
    .map(u => resolveSkillDefinition(u.skillId));
}

export function buildPlayerAutoPlacementCandidates(
  setup: PlayerBattleSetup,
): PlayerPlacementCandidate[] {
  return PLAYER_UNITS
    .filter(bp => !setup.playerUnits[bp.templateId]?.isInCamp)
    .map(bp => {
      const unitState = setup.playerUnits[bp.templateId];
      // unitState must exist for every non-camp unit (initialized at new_game)
      const level       = unitState?.level ?? bp.level;
      const progression = resolveUnitProgression(bp, unitState?.chosenUpgrades ?? {});
      const stats       = computeUnitBattleStats(
        bp, level,
        setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
        { [bp.templateId]: unitState?.permanentBonuses ?? {} },
        progression.statModifiers,
      );
      const activatableAbilities = snapshotActivatableAbilities(
        bp.templateId,
        setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
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
        }),
      };
    });
}

export function buildEnemyPlacementCandidates(
  race:  UnitRace,
  level: number,
): EnemyPlacementCandidates {
  const raceUnits = ENEMY_UNITS[race];

  const toCandidate = (bp: UnitBlueprint) => {
    const skills = resolveEnemySkills(bp, level);
    const stats  = computeUnitBattleStats(
      bp, level, {}, {}, ITEM_DEFINITIONS, {}, {},
    );
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
    const stats  = computeUnitBattleStats(
      bp, saved.level, {}, {}, ITEM_DEFINITIONS, {}, {},
    );
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


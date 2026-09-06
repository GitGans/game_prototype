import { PLAYER_UNITS, ENEMY_UNITS }      from '../data/units';
import {
  resolvePlayerUnitSpriteSheet,
  getEnemyUnitSpriteSheet,
  findEnemyUnitBlueprintWithRace,
} from './unitSprites';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { getEquippedBonuses } from '../inventory';
import { resolveUnitProgression, resolveUnitBattleStats } from '../progression';
import { createUnitInstance } from '../battle/unitFactory';
import type { PlayerBattleSetup }         from './battleSetup';
import type { PlayerPlacementCandidate, EnemyPlacementCandidates, EnemyReplayPlacementInput } from '../battle/autoPlace';
import type { UnitBlueprint, UnitRace, UpgradeOptionId } from '../shared/unitTypes';
import type { ActionSkillDefinition }      from '../shared/skillDefinitionTypes';
import { resolveSkillDefinition }          from '../progression';
import type { CellCoord }                 from '../shared/gridTypes';
import type { ItemContainer, ItemInstance, PartialBattleStatBonuses } from '../shared/itemTypes';
import {
  getPersistentCurrentHp,
  clampAliveCurrentHp,
} from './playerUnitPersistence';
import { isSelectedForBattle } from '../progression';
import type { PlayerSessionState } from './playerSessionState';

function resolveEnemySkills(blueprint: UnitBlueprint, level: number): ActionSkillDefinition[] {
  return (blueprint.enemySkillUnlocks ?? [])
    .filter(u => u.unlocksAtLevel <= level)
    .map(u => resolveSkillDefinition(u.skillId));
}

/**
 * The one player battle-setup projection, shared by campaign and debug. Takes a
 * `PlayerSessionState` directly — it never reads `GameState`, never branches on
 * campaign/debug, and never mutates the session.
 *
 * Every unit outside camp is projected, alive or dead. A persistent-dead unit
 * yields a fully resolved candidate whose factory produces a canonical dead
 * runtime unit; it is not filtered out.
 */
export function projectPlayerBattleSetup(
  session: PlayerSessionState,
  blueprints: readonly UnitBlueprint[] = PLAYER_UNITS,
): PlayerBattleSetup {
  const candidates: PlayerPlacementCandidate[] = [];

  for (const bp of blueprints) {
    const unitState = session.roster.units[bp.templateId];
    if (!unitState) continue;                      // no roster record → not in this session
    if (!isSelectedForBattle(unitState)) continue; // in camp

    const level       = unitState.level;
    const progression = resolveUnitProgression(bp, unitState.chosenUpgrades ?? {});
    const equipmentBonuses = getEquippedBonuses(
      bp.templateId, session.inventory.containers, session.inventory.instances, ITEM_DEFINITIONS,
    );
    const stats = resolveUnitBattleStats({
      blueprint:        bp,
      level,
      upgradeModifiers: progression.statModifiers,
      equipmentBonuses,
      permanentBonuses: unitState.permanentBonuses ?? {},
    });
    // Color baseline: identical inputs minus equipment.
    const statHighlightBaseStats = resolveUnitBattleStats({
      blueprint:        bp,
      level,
      upgradeModifiers: progression.statModifiers,
      permanentBonuses: unitState.permanentBonuses ?? {},
    });

    const initialLifeState = unitState.lifeState;
    const initialHp = initialLifeState === 'alive'
      ? clampAliveCurrentHp(getPersistentCurrentHp(unitState), stats.hp)
      : undefined;

    candidates.push({
      templateId:  bp.templateId,
      shape:       bp.shape,
      rowTrait:    bp.rowTrait,
      savedAnchor: unitState.lastPlacement ?? null,
      initialLifeState,
      createUnit:  (id: string) => createUnitInstance({
        blueprint: bp, id, side: 'player', level,
        classId:              progression.currentClassId,
        stats,
        statHighlightBaseStats,
        skills:               progression.skills,
        spriteSheet:          resolvePlayerUnitSpriteSheet(bp, progression),
        initialLifeState,
        ...(initialHp !== undefined ? { initialHp } : {}),
      }),
    });
  }

  return candidates;
}

export function resolvePlayerMaxHpForLevel(input: {
  blueprint: UnitBlueprint;
  level: number;
  chosenUpgrades: Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>;
  permanentBonuses: PartialBattleStatBonuses;
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
        stats,
        statHighlightBaseStats: stats,   // enemies have no equipment
        skills,
        spriteSheet:          bp.spriteFilename
          ? getEnemyUnitSpriteSheet(race, bp.spriteFilename)
          : undefined,
      }),
    };
  };

  return {
    frontPool: raceUnits.filter(bp => bp.rowTrait === 'front').map(toCandidate),
    backPool:  raceUnits.filter(bp => bp.rowTrait === 'back').map(toCandidate),
  };
}

export function buildEnemyReplayInputs(
  savedPlacements: readonly { templateId: string; anchor: CellCoord; level: number }[],
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
        stats,
        statHighlightBaseStats: stats,   // enemies have no equipment
        skills,
        spriteSheet:          bp.spriteFilename
          ? getEnemyUnitSpriteSheet(bpRace, bp.spriteFilename)
          : undefined,
      },
      anchor: saved.anchor,
    });
  }
  return result;
}


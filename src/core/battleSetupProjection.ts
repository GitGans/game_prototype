import { PLAYER_UNITS, ENEMY_UNITS }      from '../data/unitDefinitions';
import { ITEM_DEFINITIONS }               from '../data/itemDefinitions';
import { computeUnitBattleStats, snapshotActivatableAbilities } from '../battle/itemOps';
import { resolveUnitProgression }         from './unitProgression';
import { createUnitInstance, type CreateUnitInstanceInput } from '../battle/unitFactory';
import type { PlayerBattleSetup }         from './battleSetup';
import type { PlayerPlacementCandidate, EnemyPlacementCandidates } from '../battle/autoPlace';
import type { UnitBlueprint, UnitRace }   from '../shared/unitTypes';
import type { ActionSkillDefinition }      from '../shared/skillDefinitionTypes';
import type { CellCoord }                 from '../shared/gridTypes';

function resolveEnemySkills(blueprint: UnitBlueprint, level: number): ActionSkillDefinition[] {
  const base = (blueprint.skillTiers ?? [])
    .filter(t => t.unlocksAtLevel === 0)
    .flatMap(t => t.options.slice(0, 1));
  const leveled = (blueprint.levelSkills ?? [])
    .filter(ls => ls.unlocksAtLevel <= level)
    .map(ls => ls.skill);
  return [...base, ...leveled];
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
        createUnit:  (anchor: CellCoord, id: string) => createUnitInstance({
          blueprint: bp, id, anchor, level,
          stats,
          skills:               progression.skills,
          spriteSheet:          progression.spriteSheet ?? bp.spriteSheet,
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
      createUnit: (anchor: CellCoord, id: string) => createUnitInstance({
        blueprint: bp, id, anchor, level,
        stats, skills,
        spriteSheet:          bp.spriteSheet,
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
): CreateUnitInstanceInput[] {
  const allBlueprints = Object.values(ENEMY_UNITS).flat();
  let counter = 1;
  const result: CreateUnitInstanceInput[] = [];
  for (const saved of savedPlacements) {
    const bp = allBlueprints.find(b => b.templateId === saved.templateId);
    if (!bp) continue;
    const skills = resolveEnemySkills(bp, saved.level);
    const stats  = computeUnitBattleStats(
      bp, saved.level, {}, {}, ITEM_DEFINITIONS, {}, {},
    );
    result.push({
      blueprint:            bp,
      id:                   `e${counter++}`,
      anchor:               saved.anchor,
      level:                saved.level,
      stats, skills,
      spriteSheet:          bp.spriteSheet,
      activatableAbilities: [],
    });
  }
  return result;
}

export function buildPlayerUnitInput(
  templateId: string,
  anchor:     CellCoord,
  id:         string,
  setup:      PlayerBattleSetup,
): CreateUnitInstanceInput | null {
  const bp = PLAYER_UNITS.find(b => b.templateId === templateId);
  if (!bp) return null;
  const unitState   = setup.playerUnits[templateId];
  const level       = unitState?.level ?? bp.level;
  const progression = resolveUnitProgression(bp, unitState?.chosenUpgrades ?? {});
  const stats       = computeUnitBattleStats(
    bp, level,
    setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
    { [templateId]: unitState?.permanentBonuses ?? {} },
    progression.statModifiers,
  );
  const activatableAbilities = snapshotActivatableAbilities(
    templateId,
    setup.itemContainers, setup.itemInstances, ITEM_DEFINITIONS,
  );
  return {
    blueprint: bp, id, anchor, level,
    stats,
    skills:               progression.skills,
    spriteSheet:          progression.spriteSheet ?? bp.spriteSheet,
    activatableAbilities,
  };
}

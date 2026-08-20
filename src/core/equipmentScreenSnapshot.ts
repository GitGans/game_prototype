import type { PlayerSessionState } from './playerSessionState';
import type { UnitBlueprint } from '../shared/unitTypes';
import type {
  UnitTabSnapshot,
  BackpackSnapshot,
  EquipmentSnapshot,
  UnitStatsSnapshot,
  SkillIconSnapshot,
} from '../shared/snapshotTypes';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG, ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { resolveUnitProgression, type ResolvedUnitProgression } from '../progression';
import { buildBackpackSnapshot, buildEquipmentSnapshot } from '../inventory';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { buildSkillIconSnapshot } from './unitUpgradePresentation';
import { resolvePlayerUnitSpriteSheet } from './unitSprites';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { EMPTY_EQUIP_SNAPSHOT } from './phases';

export interface EquipmentScreenPlayerSnapshot {
  selectedUnitSpriteKey: string | null;
  selectedUnit: UnitTabSnapshot | null;
  availableUnits: UnitTabSnapshot[];
  backpack: BackpackSnapshot;
  unitEquipment: EquipmentSnapshot;
  unitStats: UnitStatsSnapshot | null;
  learnedSkills: SkillIconSnapshot[];
  upgradeSkills: SkillIconSnapshot[];
}

function spriteKeyFromProgression(
  blueprint: UnitBlueprint,
  progression: ResolvedUnitProgression,
): string | null {
  const sheet = resolvePlayerUnitSpriteSheet(blueprint, progression);
  return sheet ? getUnitSpriteTextureKey(blueprint.templateId, sheet) : null;
}

function buildUnitTab(blueprint: UnitBlueprint, session: PlayerSessionState): UnitTabSnapshot {
  const chosenUpgrades = session.roster.units[blueprint.templateId]?.chosenUpgrades ?? {};
  const progression = resolveUnitProgression(blueprint, chosenUpgrades);
  return {
    templateId: blueprint.templateId,
    name: blueprint.name,
    classId: progression.currentClassId,
    className: progression.currentClass.name,
    spriteKey: spriteKeyFromProgression(blueprint, progression),
  };
}

export function buildEquipmentScreenPlayerSnapshot(
  session: PlayerSessionState,
  selectedUnitTemplateId: string,
): EquipmentScreenPlayerSnapshot {
  // Matches today's buildUnitTabSnapshots(): iterate ALL blueprints unconditionally,
  // not just ones present in the roster (a unit missing from roster.units still
  // gets a tab, with chosenUpgrades defaulting to {}).
  const availableUnits = PLAYER_UNITS.map(blueprint => buildUnitTab(blueprint, session));

  const backpack = buildBackpackSnapshot(session.inventory, ITEM_CATALOG);

  const selectedBlueprint = PLAYER_UNITS.find(u => u.templateId === selectedUnitTemplateId);
  const selectedUnitState = session.roster.units[selectedUnitTemplateId];

  if (!selectedBlueprint || !selectedUnitState) {
    return {
      selectedUnitSpriteKey: null,
      selectedUnit: null,
      availableUnits,
      backpack,
      unitEquipment: EMPTY_EQUIP_SNAPSHOT,
      unitStats: null,
      learnedSkills: [],
      upgradeSkills: [],
    };
  }

  const progression = resolveUnitProgression(selectedBlueprint, selectedUnitState.chosenUpgrades);
  const unitEquipment = buildEquipmentSnapshot(selectedUnitTemplateId, session.inventory, ITEM_CATALOG);
  const unitStats = buildUnitStatsSnapshot(
    selectedBlueprint,
    selectedUnitState.level,
    selectedUnitState.permanentBonuses,
    session.inventory.containers,
    session.inventory.instances,
    ITEM_DEFINITIONS,
    progression.statModifiers,
  );
  const learnedSkills = progression.skills.map(buildSkillIconSnapshot);

  return {
    selectedUnitSpriteKey: spriteKeyFromProgression(selectedBlueprint, progression),
    selectedUnit: buildUnitTab(selectedBlueprint, session),
    availableUnits,
    backpack,
    unitEquipment,
    unitStats,
    learnedSkills,
    upgradeSkills: learnedSkills.slice(1, 5),
  };
}

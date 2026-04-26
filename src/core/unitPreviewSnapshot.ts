import type { UnitBlueprint } from '../shared/unitTypes';
import type { BenchUnitSnapshot } from '../shared/battleSnapshots';
import type { PlayerUnitState } from './GameState';
import type { PlayerBattleSetup } from './battleSetup';
import type { SkillIconSnapshot } from '../shared/snapshotTypes';
import { resolveUnitProgression } from './unitProgression';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { buildSkillDescription } from './unitUpgradePresentation';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';

// unitState should always be present for player units.
// undefined is a defensive fallback — callers should not rely on it for normal flow.
export function buildPlayerUnitPreviewSnapshot(
  blueprint: UnitBlueprint,
  unitState: PlayerUnitState | undefined,
  setup:     PlayerBattleSetup,
): BenchUnitSnapshot {
  const level       = unitState?.level ?? blueprint.level;
  const progression = resolveUnitProgression(blueprint, unitState?.chosenUpgrades ?? {});

  const stats = buildUnitStatsSnapshot(
    blueprint,
    level,
    unitState?.permanentBonuses ?? {},
    setup.itemContainers,
    setup.itemInstances,
    ITEM_DEFINITIONS,
    progression.statModifiers,
  );

  const skills: SkillIconSnapshot[] = progression.skills.map(skill => ({
    id:          skill.id,
    name:        skill.name,
    description: buildSkillDescription(skill),
    damageType:  skill.damageBlock?.damageType ?? null,
    actionType:  skill.actionType,
  }));

  const spriteKey = progression.spriteSheet
    ? getUnitSpriteTextureKey(blueprint.templateId, progression.spriteSheet)
    : null;

  return {
    templateId: blueprint.templateId,
    name:       blueprint.name,
    level,
    spriteKey,
    stats,
    skills,
  };
}

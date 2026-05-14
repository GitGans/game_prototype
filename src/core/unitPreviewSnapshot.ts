import type { UnitBlueprint } from '../shared/unitTypes';
import type { BenchUnitSnapshot } from '../shared/battleSnapshots';
import type { PlayerUnitState } from './GameState';
import type { PlayerBattleSetup } from './battleSetup';
import type { SkillIconSnapshot } from '../shared/snapshotTypes';
import type { BenchUnitRef } from '../battle/types';
import { resolveUnitProgression } from '../progression';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { buildSkillIconSnapshot } from './unitUpgradePresentation';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { resolvePlayerUnitSpriteSheet } from './unitSprites';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { PLAYER_UNITS } from '../data/units';

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

  const skills: SkillIconSnapshot[] = progression.skills.map(buildSkillIconSnapshot);

  const sheet     = resolvePlayerUnitSpriteSheet(blueprint, progression);
  const spriteKey = sheet
    ? getUnitSpriteTextureKey(blueprint.templateId, sheet)
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

/**
 * Build a BenchUnitSnapshot for a single ref.
 * Returns null only if the blueprint is not found.
 * Missing unitState uses the existing defensive fallback in buildPlayerUnitPreviewSnapshot.
 */
export function buildPlayerUnitPreviewSnapshotByTemplateId(
  templateId: string,
  setup: PlayerBattleSetup,
): BenchUnitSnapshot | null {
  const blueprint = PLAYER_UNITS.find(b => b.templateId === templateId);
  if (!blueprint) return null;
  const unitState = setup.playerUnits[templateId];
  return buildPlayerUnitPreviewSnapshot(blueprint, unitState, setup);
}

/**
 * LEGACY (Stage 4): produced BenchUnitSnapshot for the pre-Stage-4 read model.
 * As of Stage 4 the battle read model is built from state.units + state.deployments
 * via buildBenchBattleUnitSnapshots() in core/battleSnapshotBuilder.ts.
 * This function and BenchUnitSnapshot are scheduled for removal in Stage 5.
 *
 * Build render snapshots for the entire bench.
 * undefined runtime slot → null render slot (empty card).
 */
export function buildBenchUnitSnapshots(
  refs: (BenchUnitRef | undefined)[],
  setup: PlayerBattleSetup,
): (BenchUnitSnapshot | null)[] {
  return refs.map(ref =>
    ref ? buildPlayerUnitPreviewSnapshotByTemplateId(ref.templateId, setup) : null,
  );
}

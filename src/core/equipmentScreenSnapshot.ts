import type { PlayerSessionState } from './playerSessionState';
import type { UnitBlueprint, UnitClassId } from '../shared/unitTypes';
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
import { buildBackpackSnapshot, buildEquipmentSnapshot, evaluateEquipItem } from '../inventory';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { buildSkillIconSnapshot } from './unitUpgradePresentation';
import { resolvePlayerUnitSpriteSheet } from './unitSprites';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { EMPTY_EQUIP_SNAPSHOT } from './phases';
import type {
  ItemUsability, PendingItemUsePrompt, ItemActionMenuSnapshot, ItemActionOptionSnapshot,
  ItemInteraction,
} from '../shared/snapshotTypes';

// The READ MODEL only. `core/consumableUse` — the executor — is deliberately absent from this
// module's import allowlist, so a projection has no path to a roster/inventory replacement.
import { evaluateItemUsability } from './itemUsability';

export interface EquipmentScreenPlayerSnapshot {
  selectedUnitSpriteKey: string | null;
  selectedUnit: UnitTabSnapshot | null;
  availableUnits: UnitTabSnapshot[];
  backpack: BackpackSnapshot;
  unitEquipment: EquipmentSnapshot;
  unitStats: UnitStatsSnapshot | null;
  learnedSkills: SkillIconSnapshot[];
  upgradeSkills: SkillIconSnapshot[];
  /** Keyed by item instance id; usable + consumable items in the shared backpack only. */
  itemUsage: Record<string, ItemUsability>;
  itemActionMenu: ItemActionMenuSnapshot | null;
  pendingItemUsePrompt: PendingItemUsePrompt | null;
}

/**
 * Eligibility for every backpack item that can be USED — consumables and usables alike — against
 * the selected character, produced by the same evaluation the executor runs, so the UI and the
 * application never maintain separate rules. For a dead or missing selected character every entry
 * reports the blocking reason rather than being omitted, so the screen can explain why use is
 * unavailable.
 */
function buildItemUsage(
  session: PlayerSessionState,
  backpack: BackpackSnapshot,
  selectedUnitTemplateId: string,
): Record<string, ItemUsability> {
  const usage: Record<string, ItemUsability> = {};
  for (const slot of backpack.slots) {
    if (!slot) continue;
    if (slot.metadata.kind !== 'consumable' && slot.metadata.kind !== 'usable') continue;
    usage[slot.instanceId] = evaluateItemUsability({
      session,
      catalog: ITEM_CATALOG,
      playerBlueprints: PLAYER_UNITS,
      unitTemplateId: selectedUnitTemplateId,
      instanceId: slot.instanceId,
    });
  }
  return usage;
}

/**
 * Projects the open action window — or omits it.
 *
 * Omission HIDES the window; it never disposes the interaction. Disposal belongs to
 * `phaseHandlers/itemUsePhaseHandler`, the only holder of the write capability.
 *
 * Both options are decided by READ-side evaluators that execution re-runs: `use` from the usage
 * entry above, `equip` from `evaluateEquipItem` — the full precondition set of `equipItem`, not
 * the narrower `canUnitEquipItem`. Nothing here calls a mutation function to learn an answer.
 */
function buildItemActionMenu(
  session: PlayerSessionState,
  interaction: ItemInteraction | null,
  usage: Record<string, ItemUsability>,
  backpack: BackpackSnapshot,
  selectedUnitTemplateId: string,
  selectedUnitName: string | null,
  classId: UnitClassId | null,
): ItemActionMenuSnapshot | null {
  if (!interaction || interaction.kind !== 'choosing_action') return null;
  if (interaction.unitTemplateId !== selectedUnitTemplateId) return null;
  if (selectedUnitName === null || classId === null) return null;

  const slot = backpack.slots.find(s => s?.instanceId === interaction.instanceId);
  if (!slot) return null;

  const usageEntry = usage[interaction.instanceId];
  const useOption: ItemActionOptionSnapshot = usageEntry?.canUse
    ? { action: 'use', enabled: true, disabledReason: null }
    : { action: 'use', enabled: false, disabledReason: usageEntry?.reason ?? 'missing_instance' };

  const equip = evaluateEquipItem(
    selectedUnitTemplateId, classId, interaction.instanceId, session.inventory, ITEM_CATALOG,
  );
  const equipOption: ItemActionOptionSnapshot = equip.ok
    ? { action: 'equip', enabled: true, disabledReason: null }
    : { action: 'equip', enabled: false, disabledReason: equip.reason };

  return {
    instanceId: interaction.instanceId,
    unitTemplateId: interaction.unitTemplateId,
    unitName: selectedUnitName,
    itemName: slot.definition.name,
    // Copied, not forwarded: a snapshot must not share an object with the catalog.
    effect: slot.definition.useEffect ? { ...slot.definition.useEffect } : null,
    options: [useOption, equipOption],
  };
}

/**
 * Projects the pending request into renderable prompt data — or omits it.
 *
 * Omission HIDES the dialog; it never disposes the request. Disposal belongs to
 * `phaseHandlers/itemUsePhaseHandler`, the only holder of the interaction write capability.
 * Two different operations, two different owners.
 */
function buildPendingItemUsePrompt(
  interaction: ItemInteraction | null,
  usage: Record<string, ItemUsability>,
  backpack: BackpackSnapshot,
  selectedUnitTemplateId: string,
  selectedUnitName: string | null,
): PendingItemUsePrompt | null {
  if (!interaction || interaction.kind !== 'confirming_use') return null;
  if (interaction.unitTemplateId !== selectedUnitTemplateId) return null;
  if (selectedUnitName === null) return null;

  const entry = usage[interaction.instanceId];
  if (!entry?.canUse) return null;

  const slot = backpack.slots.find(s => s?.instanceId === interaction.instanceId);
  if (!slot) return null;

  return {
    instanceId: interaction.instanceId,
    unitTemplateId: interaction.unitTemplateId,
    unitName: selectedUnitName,
    itemName: slot.definition.name,
    // Forwarded whole: the prompt describes exactly what the usage entry already decided, so the
    // dialog cannot show a different effect from the one confirmation will execute.
    effect: entry.effect,
  };
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
  interaction: ItemInteraction | null = null,
): EquipmentScreenPlayerSnapshot {
  // Matches today's buildUnitTabSnapshots(): iterate ALL blueprints unconditionally,
  // not just ones present in the roster (a unit missing from roster.units still
  // gets a tab, with chosenUpgrades defaulting to {}).
  const availableUnits = PLAYER_UNITS.map(blueprint => buildUnitTab(blueprint, session));

  const backpack = buildBackpackSnapshot(session.inventory, ITEM_CATALOG);

  const selectedBlueprint = PLAYER_UNITS.find(u => u.templateId === selectedUnitTemplateId);
  const selectedUnitState = session.roster.units[selectedUnitTemplateId];

  const itemUsage = buildItemUsage(session, backpack, selectedUnitTemplateId);

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
      itemUsage,
      // No selected character to target — every usage entry already reports the reason.
      itemActionMenu: null,
      pendingItemUsePrompt: null,
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
    { currentHp: selectedUnitState.currentHp, lifeState: selectedUnitState.lifeState },
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
    itemUsage,
    itemActionMenu: buildItemActionMenu(
      session,
      interaction,
      itemUsage,
      backpack,
      selectedUnitTemplateId,
      selectedBlueprint.name,
      progression.currentClassId,
    ),
    pendingItemUsePrompt: buildPendingItemUsePrompt(
      interaction,
      itemUsage,
      backpack,
      selectedUnitTemplateId,
      selectedBlueprint.name,
    ),
  };
}

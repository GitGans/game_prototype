import type { PlayerSessionState } from './playerSessionState';
import type { UnitBlueprint } from '../shared/unitTypes';
import type {
  UnitTabSnapshot,
  BackpackSnapshot,
  EquipmentSnapshot,
  ItemSlotSnapshot,
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
import type {
  ItemUsability, ItemUseOrigin, PendingItemUsePrompt, ItemInteraction,
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
  /**
   * Keyed by item instance id: backpack usables and consumables, plus the selected character's
   * equipped usable. One entry per instance is unambiguous — an instance is in the backpack XOR in
   * an equipment slot, never both (`validateItemForUse` rejects `duplicate_placement`).
   */
  itemUsage: Record<string, ItemUsability>;
  pendingItemUsePrompt: PendingItemUsePrompt | null;
}

/**
 * Eligibility for every item that can be USED against the selected character, from both
 * out-of-combat origins: backpack consumables and usables, and the usable the character is carrying
 * in `usable_slot`. Both go through the same evaluation the executor runs, so the UI and the
 * application never maintain separate rules.
 *
 * For a dead or missing selected character every entry reports the blocking reason rather than being
 * omitted — the tooltip is required to explain why use is unavailable, so an absent entry would be
 * an explanation the screen cannot give.
 */
function buildItemUsage(
  session: PlayerSessionState,
  backpack: BackpackSnapshot,
  equippedUsable: ItemSlotSnapshot | null,
  selectedUnitTemplateId: string,
): Record<string, ItemUsability> {
  const usage: Record<string, ItemUsability> = {};

  const evaluate = (instanceId: string, origin: ItemUseOrigin): void => {
    usage[instanceId] = evaluateItemUsability({
      session,
      catalog: ITEM_CATALOG,
      playerBlueprints: PLAYER_UNITS,
      unitTemplateId: selectedUnitTemplateId,
      instanceId,
      origin,
    });
  };

  for (const slot of backpack.slots) {
    if (!slot) continue;
    if (slot.metadata.kind !== 'consumable' && slot.metadata.kind !== 'usable') continue;
    evaluate(slot.instanceId, 'backpack');
  }

  if (equippedUsable) evaluate(equippedUsable.instanceId, 'equipped_usable');

  return usage;
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
  unitEquipment: EquipmentSnapshot,
  selectedUnitTemplateId: string,
  selectedUnitName: string | null,
): PendingItemUsePrompt | null {
  if (!interaction || interaction.kind !== 'confirming_use') return null;
  if (interaction.unitTemplateId !== selectedUnitTemplateId) return null;
  if (selectedUnitName === null) return null;

  const entry = usage[interaction.instanceId];
  // The entry must describe the SAME origin the confirmation was opened for. An item that moved
  // between the backpack and `usable_slot` while the dialog was open is a different request, and the
  // dialog must not go on describing the one it was opened for.
  if (!entry?.canUse || entry.origin !== interaction.origin) return null;

  const slot = interaction.origin === 'backpack'
    ? backpack.slots.find(s => s?.instanceId === interaction.instanceId) ?? null
    : unitEquipment.slots.usable_slot?.instanceId === interaction.instanceId
      ? unitEquipment.slots.usable_slot
      : null;
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
      // Backpack entries only: with no selected character there is no equipment to project either,
      // and every entry already reports the reason use is unavailable.
      itemUsage: buildItemUsage(session, backpack, null, selectedUnitTemplateId),
      pendingItemUsePrompt: null,
    };
  }

  const progression = resolveUnitProgression(selectedBlueprint, selectedUnitState.chosenUpgrades);
  // Built BEFORE the usage map: the equipped usable is one of the two origins it evaluates.
  const unitEquipment = buildEquipmentSnapshot(selectedUnitTemplateId, session.inventory, ITEM_CATALOG);
  const itemUsage = buildItemUsage(
    session, backpack, unitEquipment.slots.usable_slot ?? null, selectedUnitTemplateId,
  );
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
    pendingItemUsePrompt: buildPendingItemUsePrompt(
      interaction,
      itemUsage,
      backpack,
      unitEquipment,
      selectedUnitTemplateId,
      selectedBlueprint.name,
    ),
  };
}

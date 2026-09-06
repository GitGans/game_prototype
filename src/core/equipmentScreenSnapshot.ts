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
import type {
  ConsumableUsability, PendingConsumePrompt, PendingConsumeRequest,
} from '../shared/snapshotTypes';
// The READ MODEL only. `core/consumableUse` — the executor — is deliberately absent from this
// module's import allowlist, so a projection has no path to a roster/inventory replacement.
import { evaluateConsumableUsability } from './consumableUsability';

export interface EquipmentScreenPlayerSnapshot {
  selectedUnitSpriteKey: string | null;
  selectedUnit: UnitTabSnapshot | null;
  availableUnits: UnitTabSnapshot[];
  backpack: BackpackSnapshot;
  unitEquipment: EquipmentSnapshot;
  unitStats: UnitStatsSnapshot | null;
  learnedSkills: SkillIconSnapshot[];
  upgradeSkills: SkillIconSnapshot[];
  /** Keyed by item instance id; consumables in the shared backpack only. */
  consumableUsage: Record<string, ConsumableUsability>;
  pendingConsumePrompt: PendingConsumePrompt | null;
}

/**
 * Eligibility for every backpack consumable against the selected character, produced by the same
 * evaluation the executor runs — the UI and the application never maintain separate rules. For a
 * dead or missing selected character every entry reports the blocking reason rather than being
 * omitted, so the screen can explain why use is unavailable.
 */
function buildConsumableUsage(
  session: PlayerSessionState,
  backpack: BackpackSnapshot,
  selectedUnitTemplateId: string,
): Record<string, ConsumableUsability> {
  const usage: Record<string, ConsumableUsability> = {};
  for (const slot of backpack.slots) {
    if (!slot || slot.metadata.kind !== 'consumable') continue;
    usage[slot.instanceId] = evaluateConsumableUsability({
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
 * Projects the pending request into renderable prompt data — or omits it.
 *
 * Omission HIDES the dialog; it never disposes the request. Disposal belongs to
 * `phaseHandlers/consumablePhaseHandler`, the only holder of the confirmation write capability.
 * Two different operations, two different owners.
 */
function buildPendingConsumePrompt(
  pendingConsume: PendingConsumeRequest | null,
  usage: Record<string, ConsumableUsability>,
  backpack: BackpackSnapshot,
  selectedUnitTemplateId: string,
  selectedUnitName: string | null,
): PendingConsumePrompt | null {
  if (!pendingConsume) return null;
  if (pendingConsume.unitTemplateId !== selectedUnitTemplateId) return null;
  if (selectedUnitName === null) return null;

  const entry = usage[pendingConsume.instanceId];
  if (!entry?.canUse) return null;

  const slot = backpack.slots.find(s => s?.instanceId === pendingConsume.instanceId);
  if (!slot) return null;

  return {
    instanceId: pendingConsume.instanceId,
    unitTemplateId: pendingConsume.unitTemplateId,
    unitName: selectedUnitName,
    itemName: slot.definition.name,
    stat: entry.effect.stat,
    amount: entry.effect.amount,
    healsCurrentHp: entry.effect.healsCurrentHp,
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
  pendingConsume: PendingConsumeRequest | null = null,
): EquipmentScreenPlayerSnapshot {
  // Matches today's buildUnitTabSnapshots(): iterate ALL blueprints unconditionally,
  // not just ones present in the roster (a unit missing from roster.units still
  // gets a tab, with chosenUpgrades defaulting to {}).
  const availableUnits = PLAYER_UNITS.map(blueprint => buildUnitTab(blueprint, session));

  const backpack = buildBackpackSnapshot(session.inventory, ITEM_CATALOG);

  const selectedBlueprint = PLAYER_UNITS.find(u => u.templateId === selectedUnitTemplateId);
  const selectedUnitState = session.roster.units[selectedUnitTemplateId];

  const consumableUsage = buildConsumableUsage(session, backpack, selectedUnitTemplateId);

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
      consumableUsage,
      // No selected character to target — every usage entry already reports the reason.
      pendingConsumePrompt: null,
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
    consumableUsage,
    pendingConsumePrompt: buildPendingConsumePrompt(
      pendingConsume,
      consumableUsage,
      backpack,
      selectedUnitTemplateId,
      selectedBlueprint.name,
    ),
  };
}

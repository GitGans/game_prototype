import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { PhaseAction } from '../phases';
import { PLAYER_UNITS } from '../../data/units';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { resolveUnitProgression } from '../../progression';
import { equipItem, unequipItem, isConcreteEquipSlot } from '../../inventory';

export type EquipmentPhaseAction =
  Extract<PhaseAction, { type: 'equip_item' | 'unequip_item' }>;

export function applyEquipmentPhaseAction(input: {
  source: PlayerSessionSource;
  action: EquipmentPhaseAction;
}): void {
  const { source, action } = input;
  const session = PlayerSessionStore.getSession(source);

  const blueprint = PLAYER_UNITS.find(u => u.templateId === action.unitTemplateId);
  if (!blueprint) return;

  const unitState = session.roster.units[action.unitTemplateId];
  if (!unitState) return;

  if (action.type === 'equip_item') {
    const progression = resolveUnitProgression(blueprint, unitState.chosenUpgrades);
    const result = equipItem(
      action.unitTemplateId,
      progression.currentClassId,
      action.instanceId,
      session.inventory,
      ITEM_CATALOG,
    );
    if (result.ok) {
      PlayerSessionStore.replaceInventory(source, result.nextInventory);
    }
    return;
  }

  // action.type === 'unequip_item'
  if (!isConcreteEquipSlot(action.slot)) return;
  const result = unequipItem(
    action.unitTemplateId,
    action.slot,
    session.inventory,
    ITEM_CATALOG,
  );
  if (result.ok) {
    PlayerSessionStore.replaceInventory(source, result.nextInventory);
  }
}

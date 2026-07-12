import type { RosterState, PlayerUnitState } from './rosterState';
import type { UnitBlueprint, UpgradeOptionId } from '../shared/unitTypes';

export interface ChooseUnitUpgradeInput {
  templateId: string;
  tierId: 5 | 10 | 15 | 20;
  upgradeId: UpgradeOptionId;
}

export type ChooseUnitUpgradeResult =
  | { ok: true; nextRoster: RosterState }
  | {
      ok: false;
      reason:
        | 'unit_not_found'
        | 'blueprint_not_found'
        | 'tier_not_found'
        | 'option_not_found'
        | 'level_locked'
        | 'tier_already_chosen';
    };

export function chooseUnitUpgrade(
  roster: RosterState,
  playerBlueprints: readonly UnitBlueprint[],
  input: ChooseUnitUpgradeInput,
): ChooseUnitUpgradeResult {
  const unit = roster.units[input.templateId];
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  const blueprint = playerBlueprints.find(b => b.templateId === input.templateId);
  if (!blueprint) return { ok: false, reason: 'blueprint_not_found' };

  const tier = blueprint.upgradeTiers?.find(t => t.unlocksAtLevel === input.tierId);
  if (!tier) return { ok: false, reason: 'tier_not_found' };

  const option = tier.options.find(o => o.id === input.upgradeId);
  if (!option) return { ok: false, reason: 'option_not_found' };

  if (unit.level < tier.unlocksAtLevel) {
    return { ok: false, reason: 'level_locked' };
  }
  if (unit.chosenUpgrades[input.tierId]) {
    return { ok: false, reason: 'tier_already_chosen' };
  }

  const nextUnit: PlayerUnitState = {
    ...unit,
    chosenUpgrades: { ...unit.chosenUpgrades, [input.tierId]: input.upgradeId },
  };
  const nextUnits = { ...roster.units, [input.templateId]: nextUnit };
  return { ok: true, nextRoster: { units: nextUnits } };
}

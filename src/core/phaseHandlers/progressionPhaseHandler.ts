import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { PhaseAction } from '../phases';
import { PLAYER_UNITS } from '../../data/units';
import { chooseUnitUpgrade, type ChooseUnitUpgradeResult } from '../../progression';

export function applyChooseUpgradePhaseAction(input: {
  source: PlayerSessionSource;
  unitTemplateId: string;
  action: Extract<PhaseAction, { type: 'choose_upgrade' }>;
}): ChooseUnitUpgradeResult {
  const { source, unitTemplateId, action } = input;
  const session = PlayerSessionStore.getSession(source);
  const result = chooseUnitUpgrade(session.roster, PLAYER_UNITS, {
    templateId: unitTemplateId,
    tierId: action.tierId,
    upgradeId: action.upgradeId,
  });
  if (result.ok) {
    PlayerSessionStore.replaceRoster(source, result.nextRoster);
  }
  return result;
}

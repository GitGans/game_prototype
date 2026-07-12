import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { PhaseAction } from '../phases';
import { toggleUnitCampStatus, type ToggleUnitCampResult } from '../../progression';

export function applyCampPhaseAction(input: {
  source: PlayerSessionSource;
  action: Extract<PhaseAction, { type: 'toggle_camp_unit' }>;
}): ToggleUnitCampResult {
  const { source, action } = input;
  const session = PlayerSessionStore.getSession(source);
  const result = toggleUnitCampStatus(session.roster, action.templateId);
  if (result.ok) {
    PlayerSessionStore.replaceRoster(source, result.nextRoster);
  }
  return result;
}

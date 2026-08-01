import type { RosterState } from '../progression';
import type { CampUnitSnapshot } from './phases';
import { PLAYER_UNITS } from '../data/units';
import { getRosterPartyStatus } from '../progression';

export interface RosterCampSnapshot {
  units: CampUnitSnapshot[];
  campUnitIds: string[];
  selectedForBattleUnitCount: number;
  activeLivingUnitCount: number;
  canStartBattle: boolean;
}

export function buildRosterCampSnapshot(roster: RosterState): RosterCampSnapshot {
  const units: CampUnitSnapshot[] = PLAYER_UNITS.map(bp => {
    const unitState = roster.units[bp.templateId];
    return {
      templateId: bp.templateId,
      name:       bp.name,
      level:      unitState?.level ?? bp.level,
      inCamp:     unitState?.isInCamp ?? false,
      isAlive:    unitState?.lifeState === 'alive',
    };
  });

  const campUnitIds = units.filter(u => u.inCamp).map(u => u.templateId);
  const { selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
    getRosterPartyStatus(roster);

  return { units, campUnitIds, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle };
}

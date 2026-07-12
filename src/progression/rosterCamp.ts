import type { RosterState, PlayerUnitState } from './rosterState';

export const MIN_ACTIVE_BATTLE_PARTY_SIZE = 1;
export const MAX_ACTIVE_BATTLE_PARTY_SIZE = 9;

export function isActiveLivingUnit(unit: PlayerUnitState): boolean {
  return unit.lifeState === 'alive' && !unit.isInCamp;
}

export interface RosterPartyStatus {
  activeLivingUnitCount: number;
  canStartBattle: boolean;
}

export function getRosterPartyStatus(roster: RosterState): RosterPartyStatus {
  const activeLivingUnitCount = Object.values(roster.units).filter(isActiveLivingUnit).length;
  return {
    activeLivingUnitCount,
    canStartBattle:
      activeLivingUnitCount >= MIN_ACTIVE_BATTLE_PARTY_SIZE &&
      activeLivingUnitCount <= MAX_ACTIVE_BATTLE_PARTY_SIZE,
  };
}

export type ToggleUnitCampResult =
  | { ok: true; nextRoster: RosterState }
  | { ok: false; reason: 'unit_not_found' | 'last_active_living_unit' };

export function toggleUnitCampStatus(
  roster: RosterState,
  templateId: string,
): ToggleUnitCampResult {
  const unit = roster.units[templateId];
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  const movingIntoCamp = !unit.isInCamp;

  if (movingIntoCamp && unit.lifeState === 'alive') {
    const hasOtherActiveLiving = Object.entries(roster.units).some(
      ([id, u]) => id !== templateId && isActiveLivingUnit(u),
    );
    if (!hasOtherActiveLiving) {
      return { ok: false, reason: 'last_active_living_unit' };
    }
  }

  const nextUnit: PlayerUnitState = { ...unit, isInCamp: movingIntoCamp };
  const nextUnits = { ...roster.units, [templateId]: nextUnit };
  return { ok: true, nextRoster: { units: nextUnits } };
}

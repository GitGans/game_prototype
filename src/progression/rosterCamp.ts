import type { RosterState, PlayerUnitState } from './rosterState';

export const MIN_LIVING_BATTLE_PARTY_SIZE = 1;
export const MAX_SELECTED_BATTLE_PARTY_SIZE = 9;

// Inclusion in battle setup and selected-party capacity. Alive or dead:
// a persistent-dead unit still consumes a field or bench deployment.
export function isSelectedForBattle(unit: PlayerUnitState): boolean {
  return !unit.isInCamp;
}

// Living-party minimum and last-living camp protection.
export function isActiveLivingUnit(unit: PlayerUnitState): boolean {
  return !unit.isInCamp && unit.lifeState === 'alive';
}

export interface RosterPartyStatus {
  selectedForBattleUnitCount: number;
  activeLivingUnitCount: number;
  canStartBattle: boolean;
}

export function getRosterPartyStatus(roster: RosterState): RosterPartyStatus {
  const units = Object.values(roster.units);
  const selectedForBattleUnitCount = units.filter(isSelectedForBattle).length;
  const activeLivingUnitCount      = units.filter(isActiveLivingUnit).length;
  return {
    selectedForBattleUnitCount,
    activeLivingUnitCount,
    canStartBattle:
      activeLivingUnitCount >= MIN_LIVING_BATTLE_PARTY_SIZE &&
      selectedForBattleUnitCount <= MAX_SELECTED_BATTLE_PARTY_SIZE,
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

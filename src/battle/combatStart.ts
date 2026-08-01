import type { BattleState } from './types';
import { getFieldUnitEntries } from './deployment';
import { isAlive } from './lifeState';

/**
 * A roster can be valid while every living unit sits on the bench and only
 * corpses hold the field — persistent-dead units are deployed like any other
 * unit. Combat must not start there: the round queue would contain no player
 * unit at all.
 */
export function canBeginCombat(state: BattleState): boolean {
  if (state.phase !== 'placement') return false;
  return getFieldUnitEntries(state).some(([, u]) => u.side === 'player' && isAlive(u));
}

import type { Effect } from './skillTypes';

export type PeriodicHpDirection = 'heal' | 'damage';

export interface PeriodicHp {
  direction: PeriodicHpDirection;
  amountPerTurn: number;
}

export interface ActiveEffect {
  effectDisplayName: string;
  effect: Effect;
  remainingRounds: number;

  // Present only when the skill applies periodic HP. Absent for stat-only effects.
  // effect.isBuff is presentation/classification metadata only — not a runtime direction source.
  periodicHp?: PeriodicHp;
}

/**
 * Returns the periodic HP semantics for an active effect, or undefined for stat-only effects.
 * Used by tickEffects (runtime) and EffectTooltip (display) to keep behavior identical.
 */
export function resolveActiveEffectPeriodicHp(
  ae: ActiveEffect,
): PeriodicHp | undefined {
  return ae.periodicHp;
}

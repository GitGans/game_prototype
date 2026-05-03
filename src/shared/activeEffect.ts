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

  // Legacy fallback. Do not use to determine direction when periodicHp is present.
  // TODO(Stage 12+): remove after all ActiveEffect producers write periodicHp.
  computedPerTurn?: number;

  // Authoritative runtime HP direction when present (Stage 10+).
  // effect.isBuff is presentation/classification metadata only.
  periodicHp?: PeriodicHp;
}

/**
 * Resolves the effective periodic HP semantics for an active effect.
 * Prefers the explicit bridge field; falls back to the legacy computedPerTurn + isBuff pair.
 * Used by both tickEffects (runtime) and EffectTooltip (display) to ensure identical behavior.
 */
export function resolveActiveEffectPeriodicHp(
  ae: ActiveEffect,
): PeriodicHp | undefined {
  if (ae.periodicHp) return ae.periodicHp;
  if (ae.computedPerTurn !== undefined) {
    return {
      direction: ae.effect.isBuff ? 'heal' : 'damage',
      amountPerTurn: ae.computedPerTurn,
    };
  }
  return undefined;
}

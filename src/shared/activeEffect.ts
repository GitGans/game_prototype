import type { Effect } from './skillTypes';

export type PeriodicHpDirection = 'heal' | 'damage';

export interface PeriodicHp {
  readonly direction: PeriodicHpDirection;
  readonly amountPerTurn: number;
}

// Runtime-owned and read-only through the battle-runtime read gateway: effects are
// replaced (`{ ...ae, remainingRounds: next }`), never patched in place. `Effect` is a
// flat record, so `Readonly<Effect>` is a complete read-only view of it — the global
// `Effect` authoring contract deliberately stays mutable.
export interface ActiveEffect {
  readonly effectDisplayName: string;
  readonly effect: Readonly<Effect>;
  readonly remainingRounds: number;

  // Present only when the skill applies periodic HP. Absent for stat-only effects.
  // effect.effectTone is presentation/classification metadata only — not a runtime direction source.
  readonly periodicHp?: PeriodicHp;
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

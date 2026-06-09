// Pure stat-color decision shared by every screen that highlights stats.
// Must stay dependency-free: no Phaser, no UI_THEME, no core/battle/inventory/progression.

export type StatTone = 'positive' | 'negative' | 'neutral';

/**
 * Compares a displayed stat value against its highlight baseline.
 * `highlightBase` already includes level/tier/permanent; the delta therefore
 * reflects only equipment and active battle effects.
 *
 * All currently displayed stats are higher-is-better. `lower_is_better` is
 * intentionally NOT modeled yet — no such stat exists.
 */
export function resolveStatTone(value: number, highlightBase: number): StatTone {
  if (value > highlightBase) return 'positive';
  if (value < highlightBase) return 'negative';
  return 'neutral';
}

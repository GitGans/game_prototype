import type { UnitBattleStatKey } from '../shared/unitTypes';
import { UNIT_BATTLE_STAT_KEYS } from '../shared/unitTypes';

export type StatDisplayFormat = 'plain' | 'percent';

export interface StatPresentation {
  label: string;
  format: StatDisplayFormat;
}

export const STAT_PRESENTATION: Record<UnitBattleStatKey, StatPresentation> = {
  hp:               { label: 'HP',         format: 'plain'   },
  physicalStrength: { label: 'Phys Str',   format: 'plain'   },
  magicalStrength:  { label: 'Magic Str',  format: 'plain'   },
  physicalDefense:  { label: 'Phys Def',   format: 'percent' },
  magicalDefense:   { label: 'Magic Def',  format: 'percent' },
  dodge:            { label: 'Dodge',      format: 'percent' },
  block:            { label: 'Block',      format: 'percent' },
  initiative:       { label: 'Initiative', format: 'plain'   },
};

/** Formats a magnitude only — no sign. Callers that need a sign (e.g. bonus deltas) own it themselves. */
export function formatStatValue(key: UnitBattleStatKey, value: number): string {
  return STAT_PRESENTATION[key].format === 'percent' ? `${value}%` : String(value);
}

export { UNIT_BATTLE_STAT_KEYS };

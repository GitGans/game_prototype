export type SkillLevel = number;
export type SkillLevelTable<T> = Record<SkillLevel, T>;

export interface Effect {
  id: string;
  effectTone: 'positive' | 'negative';
  physicalDefenseBonus?: number;
  magicalDefenseBonus?: number;
  dodgeBonus?: number;
  blockBonus?: number;
  initiativeBonus?: number;
  physicalStrengthBonus?: number;
  magicalStrengthBonus?: number;
  description?: string;
}

export interface PatternCell {
  multiplier: number;
}

export interface SkillPattern {
  anchorRow: number;
  anchorCol: number;
  cells: (PatternCell | null)[][];
}

export interface LeveledMultiplierMatrix {
  levels: SkillLevelTable<SkillPattern>;
}

export type AreaPatternCell = { multiplier: 1 };

export interface EffectAreaPattern {
  anchorRow: number;
  anchorCol: number;
  cells: (AreaPatternCell | null)[][];
}

export interface EffectAreaMatrix {
  levels: SkillLevelTable<EffectAreaPattern>;
}

export type LeveledEffectDef =
  | {
      effectKind: 'periodic_hp';
      effect: Effect;
    }
  | {
      effectKind: 'stat_modifier';
      effect: Effect;
      bonusByLevel: SkillLevelTable<number>;
    };

export type InstantEffectType = 'provoke' | 'distract';

export type InstantEffectEvent =
  | { type: 'instant_effect_applied'; unitId: string; unitName: string; displayName: string }
  | { type: 'instant_effect_failed';  unitId: string; unitName: string; displayName: string }
  | { type: 'provoke_skip';           unitId: string; unitName: string }
  | { type: 'distract_skip';          unitId: string; unitName: string };

export type DamageModifierType =
  | 'ignore_block'
  | 'ignore_dodge'
  | 'ignore_physical_defense'
  | 'ignore_magical_defense';

export type PostDamageType = 'self_vampirism' | 'mass_vampirism';

// ─── Semantic combat input types ──────────────────────────────────────────────
// These replace the legacy block shapes at the combat helper boundary.
// Both skillUsePlan.ts and combat.ts import from here — no upward dependency needed.

export type DamageModifierRef = {
  type: DamageModifierType;
  level: number;
};

export type PostDamageEffect = {
  type: PostDamageType;
  level: number;
};

export type InstantEffectApplication = {
  type: InstantEffectType;
  displayName: string;
};

export type AppliedEffectMeta = {
  displayName: string;
  duration: number;
};


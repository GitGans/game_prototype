export type DamageType = 'physical' | 'magical';
export type SkillActionType = 'melee' | 'ranged' | 'mass_enchantment' | 'self_enchantment';

export interface Effect {
  id: string;
  isBuff: boolean;
  physicalDefenseBonus?: number;
  magicalDefenseBonus?: number;
  dodgeBonus?: number;
  blockBonus?: number;
  initiativeBonus?: number;
  physicalDamageBonus?: number;
  magicalDamageBonus?: number;
  description?: string;
}

export interface DamageBlock {
  matrixName: string;
  damageType: DamageType;
  level: number;
}

export interface SkillEffectBlock {
  effectMatrixName: string;
  level: number;
  effectDisplayName: string;
  effectName: string;
  duration: number;
  damageType: DamageType;
}

export interface PatternCell {
  damageMultiplier: number;
}

export interface SkillPattern {
  anchorRow: number;
  anchorCol: number;
  cells: (PatternCell | null)[][];
}

export interface LeveledDamageMatrix {
  levels: SkillPattern[];
}

export interface LeveledEffectDef {
  effect: Effect;
  effectDamageType?: DamageType;
  bonusByLevel?: number[];
}

export type InstantEffectType = 'provoke' | 'distract';

export interface InstantEffectBlock {
  instantEffectMatrixName: string;
  level: number;
  instantEffectType: InstantEffectType;
  displayName: string;
}

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

export interface DamageModifierBlock {
  type: DamageModifierType;
  level: number;
}

export type PostDamageType = 'self_vampirism' | 'mass_vampirism';

export interface PostDamageBlock {
  type: PostDamageType;
  level: number;
}

export interface Skill {
  id: string;
  name: string;
  actionType: SkillActionType;
  damageBlock?: DamageBlock;
  effectBlock?: SkillEffectBlock;
  instantEffectBlock?: InstantEffectBlock;
  damageModifierBlocks?: DamageModifierBlock[];
  postDamageBlock?: PostDamageBlock;
}

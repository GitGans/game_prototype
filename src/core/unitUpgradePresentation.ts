import { Skill, UnitProgressionStatModifiers, UnitUpgradeOption } from '../battle/types';
import {
  compileLegacySkill,
  type SkillUseAction,
  type SkillUsePlan,
} from '../battle/skillUsePlan';
import type {
  SkillIconColorKind,
  SkillIconSnapshot,
} from '../shared/snapshotTypes';

export interface UnitUpgradeStatLineSnapshot {
  stat:  keyof UnitProgressionStatModifiers;
  label: string;
  value: number;
  text:  string;
  tone:  'positive' | 'negative';
}

const STAT_ORDER: ReadonlyArray<keyof UnitProgressionStatModifiers> = [
  'hp',
  'physicalDamage',
  'magicalDamage',
  'physicalDefense',
  'magicalDefense',
  'dodge',
  'block',
  'initiative',
];

const STAT_LABELS: Record<keyof UnitProgressionStatModifiers, string> = {
  hp:              'HP',
  physicalDamage:  'P.Dmg',
  magicalDamage:   'M.Dmg',
  physicalDefense: 'P.Def',
  magicalDefense:  'M.Def',
  dodge:           'Dodge',
  block:           'Block',
  initiative:      'Init',
};

// ─── Private plan helpers ────────────────────────────────────────────────────

function targetPolicyLabel(plan: SkillUsePlan): string {
  switch (plan.targetPolicy.type) {
    case 'friendly':     return 'friendly';
    case 'self':         return 'self';
    case 'enemy_melee':  return 'melee';
    case 'enemy_ranged': return 'ranged';
  }
}

type EffectPresentationAction = Extract<
  SkillUseAction,
  { type: 'apply_stat_effect' | 'apply_periodic_hp_effect' }
>;

function isEffectPresentationAction(
  action: SkillUseAction,
): action is EffectPresentationAction {
  return action.type === 'apply_stat_effect' || action.type === 'apply_periodic_hp_effect';
}

function powerColorKindFromAction(action: SkillUseAction): SkillIconColorKind | null {
  if (action.type === 'damage' || action.type === 'apply_periodic_hp_effect') {
    return action.powerSource === 'magical_strength' ? 'magical' : 'physical';
  }
  if (action.type === 'heal') {
    if (action.powerSource === 'physical_strength') return 'physical';
    return 'magical'; // includes legacy_enchantment_heal_power
  }
  return null;
}

// ─── Public plan helpers ─────────────────────────────────────────────────────

// First powered action wins. For skills with immediate damage + DoT, compileLegacySkill
// emits damage first, so color matches legacy damageBlock.damageType behavior.
export function getSkillPlanColorKind(plan: SkillUsePlan): SkillIconColorKind {
  for (const action of plan.actions) {
    const color = powerColorKindFromAction(action);
    if (color) return color;
  }
  return 'neutral';
}

export function buildSkillDescriptionFromPlan(plan: SkillUsePlan): string {
  const target = targetPolicyLabel(plan);

  const effectAction = plan.actions.find(isEffectPresentationAction);
  if (effectAction) {
    return `${target} · applies ${effectAction.effectBlock.effectDisplayName}`;
  }

  const instantAction = plan.actions.find((a) => a.type === 'instant_effect');
  if (instantAction?.type === 'instant_effect') {
    return `${target} · ${instantAction.instantEffectBlock.displayName}`;
  }

  const damageAction = plan.actions.find((a) => a.type === 'damage');
  if (damageAction?.type === 'damage') {
    const power = damageAction.powerSource === 'magical_strength' ? 'magical' : 'physical';
    return `${target} · ${power} damage`;
  }

  const healAction = plan.actions.find((a) => a.type === 'heal');
  if (healAction) {
    return `${target} · heal`;
  }

  return target;
}

export function buildSkillTagFromPlan(plan: SkillUsePlan): string {
  const target = targetPolicyLabel(plan);
  const color  = getSkillPlanColorKind(plan);

  if (color !== 'neutral') {
    return `${target} · ${color}`;
  }

  if (plan.actions.some(isEffectPresentationAction)) {
    return `${target} · effect`;
  }

  if (plan.actions.some((a) => a.type === 'instant_effect')) {
    return `${target} · instant`;
  }

  if (plan.actions.some((a) => a.type === 'post_damage')) {
    return `${target} · post-damage`;
  }

  return target;
}

// ─── Public factories ─────────────────────────────────────────────────────────

export function buildSkillDescription(skill: Skill): string {
  return buildSkillDescriptionFromPlan(compileLegacySkill(skill));
}

export function buildSkillIconSnapshot(skill: Skill): SkillIconSnapshot {
  const plan = compileLegacySkill(skill);
  return {
    id:          skill.id,
    name:        skill.name,
    description: buildSkillDescriptionFromPlan(plan),
    tag:         buildSkillTagFromPlan(plan),
    colorKind:   getSkillPlanColorKind(plan),
  };
}

// ─── Upgrade presentation ─────────────────────────────────────────────────────

// Priority: option.description → skill description → ''
export function buildUnitUpgradeDescription(option: UnitUpgradeOption): string {
  const explicit = option.description?.trim();
  if (explicit) return explicit;
  if (option.skill) return buildSkillDescription(option.skill);
  return '';
}

// Stable order guaranteed by STAT_ORDER, not Object.entries().
export function buildUnitUpgradeStatLines(
  modifiers: UnitProgressionStatModifiers,
): UnitUpgradeStatLineSnapshot[] {
  return STAT_ORDER
    .filter(stat => modifiers[stat] !== undefined && modifiers[stat] !== 0)
    .map(stat => {
      const value = modifiers[stat]!;
      return {
        stat,
        label: STAT_LABELS[stat],
        value,
        text:  `${value > 0 ? '+' : ''}${value} ${STAT_LABELS[stat]}`,
        tone:  value > 0 ? 'positive' : 'negative',
      } as UnitUpgradeStatLineSnapshot;
    });
}

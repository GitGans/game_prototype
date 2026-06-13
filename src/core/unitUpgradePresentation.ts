import { UnitProgressionStatModifiers } from '../battle/types';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import type { SkillUseAction, SkillUsePlan } from '../battle/skillUsePlan';
import type {
  SkillIconColorKind,
  SkillIconSnapshot,
} from '../shared/snapshotTypes';
import { getSkillIconTextureKey } from './unitSpriteKey';

export interface UnitUpgradeStatLineSnapshot {
  stat:  keyof UnitProgressionStatModifiers;
  label: string;
  value: number;
  text:  string;
  tone:  'positive' | 'negative';
}

const STAT_ORDER: ReadonlyArray<keyof UnitProgressionStatModifiers> = [
  'hp',
  'physicalStrength',
  'magicalStrength',
  'physicalDefense',
  'magicalDefense',
  'dodge',
  'block',
  'initiative',
];

const STAT_LABELS: Record<keyof UnitProgressionStatModifiers, string> = {
  hp:              'HP',
  physicalStrength:  'Phys Str',
  magicalStrength:   'Magic Str',
  physicalDefense: 'P.Def',
  magicalDefense:  'M.Def',
  dodge:           'Dodge',
  block:           'Block',
  initiative:      'Init',
};

// ─── Private plan helpers ────────────────────────────────────────────────────

function targetPolicyLabel(plan: SkillUsePlan): string {
  switch (plan.targetPolicy.type) {
    case 'alive_friendly': return 'friendly';
    case 'self':           return 'self';
    case 'enemy_melee':    return 'melee';
    case 'enemy_ranged':   return 'ranged';
    case 'dead_friendly':  return 'dead ally';
    default: {
      const _exhaustive: never = plan.targetPolicy;
      return _exhaustive;
    }
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
    return 'magical';
  }
  return null;
}

// ─── Public plan helpers ─────────────────────────────────────────────────────

// First powered action in SkillUsePlan.actions wins.
// compileSkillUsePlan preserves ActionSkillDefinition action order, so a skill with damage + DoT
// produces the damage action first — color reflects the leading action's power source.
export function getSkillPlanColorKind(plan: SkillUsePlan): SkillIconColorKind {
  for (const action of plan.actions) {
    const color = powerColorKindFromAction(action);
    if (color) return color;
  }
  return 'neutral';
}

export function buildSkillDescriptionFromPlan(plan: SkillUsePlan): string {
  const target = targetPolicyLabel(plan);
  const parts: string[] = [];

  for (const action of plan.actions) {
    switch (action.type) {
      case 'damage': {
        const power = action.powerSource === 'magical_strength' ? 'magical' : 'physical';
        parts.push(`${power} damage`);
        break;
      }
      case 'heal':
        parts.push('heal');
        break;
      case 'apply_stat_effect':
        parts.push(`applies ${action.effect.displayName}`);
        break;
      case 'apply_periodic_hp_effect':
        parts.push(action.effect.displayName);
        break;
      case 'probability_effect':
        parts.push(action.probabilityEffect.displayName);
        break;
      case 'post_damage':
        parts.push(action.postDamage.type === 'self_vampirism' ? 'vampirism' : 'mass vampirism');
        break;
    }
  }

  if (parts.length === 0) return target;
  return `${target} · ${parts.join(' + ')}`;
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

  if (plan.actions.some((a) => a.type === 'probability_effect')) {
    return `${target} · effect`;
  }

  if (plan.actions.some((a) => a.type === 'post_damage')) {
    return `${target} · post-damage`;
  }

  return target;
}

// ─── Public factories ─────────────────────────────────────────────────────────

export function buildSkillIconSnapshot(skill: ActionSkillDefinition): SkillIconSnapshot {
  const plan = compileSkillUsePlan(skill);
  return {
    id:             skill.id,
    name:           skill.name,
    iconTextureKey: skill.skillIconFilename ? getSkillIconTextureKey(skill.id) : null,
    description:    buildSkillDescriptionFromPlan(plan),
    tag:            buildSkillTagFromPlan(plan),
    colorKind:      getSkillPlanColorKind(plan),
  };
}

// ─── Upgrade presentation ─────────────────────────────────────────────────────

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

import type { CellCoord, Side, UnitShape } from '../shared/gridTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { UnitLifeState } from '../shared/unitTypes';
import type {
  SkillPreviewCell,
  SkillPreviewHeaderColorKind,
  SkillPreviewModel,
} from '../shared/skillPreviewModel';
import { getActiveSkill } from './skillRuntime';
import { computeDamageVsEffectiveStats, getDefenseIgnoreModifierTypeForPowerSource, computePeriodicHpAmount, type EffectiveStats } from './combat';
import { resolvePattern } from './skillPatterns';
import { getDamageModifierPercent, getVampirismPercent } from './skillDefinitionRuntime';
import { cellKey } from './field';
import type { ResolvedHitCell } from './types';
import { compileSkillUsePlan } from './skillPlanCompiler';
import { resolvePlanPattern } from './skillPlanPatterns';
import { getUnitPowerFromEffectiveStats } from './skillPower';
import {
  isAliveFriendlyTargetPolicy,
  isDeadFriendlyTargetPolicy,
  type SkillUsePlan,
} from './skillUsePlan';
import {
  computeReviveHp,
  resolveReviveTargetsForAction,
  type ReviveResolutionUnit,
} from './revive';

export type { SkillPreviewModel } from '../shared/skillPreviewModel';

// ─── Input types ──────────────────────────────────────────────────────────────
// Battle-layer preview input. Built explicitly by core/battleSkillPreviewProjection.ts
// (the adapter maps the scene-facing BattleUnitSnapshot, including currentHp → hp, into
// this shape). Kept in battle/ so BattleUnitSnapshot never imports into battle/.
// `effectiveStats` is already post active-effects, so preview reuses it directly.

export type SkillPreviewUnit = {
  id: string;
  name: string;
  side: Side;
  lifeState: UnitLifeState;
  hp: number;
  maxHp: number;
  shape: UnitShape;
  effectiveStats: EffectiveStats;
  skills: readonly ActionSkillDefinition[];
  activeSkillIndex: number;
};

// Compile-time check: revive resolver accepts SkillPreviewUnit shape directly.
// Written as a conditional type + `void` so it survives `noUnusedLocals` /
// `noUnusedParameters`. If SkillPreviewUnit ever diverges from
// ReviveResolutionUnit the literal `true` will no longer satisfy the conditional.
type _SkillPreviewUnitSatisfiesReviveResolutionUnit =
  SkillPreviewUnit extends ReviveResolutionUnit ? true : false;
const _skillPreviewUnitSatisfiesReviveResolutionUnit:
  _SkillPreviewUnitSatisfiesReviveResolutionUnit = true;
void _skillPreviewUnitSatisfiesReviveResolutionUnit;

export type SkillPreviewInput = {
  activeUnit: SkillPreviewUnit | null;
  targetCoord: CellCoord;
  occupancy: {
    cellToUnitId: ReadonlyMap<string, string>;
  };
  unitsById: ReadonlyMap<string, SkillPreviewUnit>;
  deployments: ReadonlyMap<string, UnitDeployment>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatProbability(cells: ResolvedHitCell[]): string {
  const minPct = Math.round(Math.min(...cells.map(c => c.multiplier)) * 100);
  const maxPct = Math.round(Math.max(...cells.map(c => c.multiplier)) * 100);
  return minPct === maxPct ? `${minPct}%` : `${minPct}-${maxPct}%`;
}

function isHealTargetPolicy(plan: SkillUsePlan): boolean {
  return isAliveFriendlyTargetPolicy(plan.targetPolicy) || plan.targetPolicy.type === 'self';
}

function getPreviewHeaderColorKindFromPlan(
  plan: SkillUsePlan,
): SkillPreviewHeaderColorKind {
  for (const action of plan.actions) {
    if (action.type === 'damage') {
      return action.powerSource === 'magical_strength' ? 'magical' : 'physical';
    }
  }
  for (const action of plan.actions) {
    if (action.type === 'heal') {
      return action.powerSource === 'physical_strength' ? 'physical' : 'magical';
    }
  }
  for (const action of plan.actions) {
    if (action.type === 'apply_periodic_hp_effect') {
      return action.powerSource === 'magical_strength' ? 'magical' : 'physical';
    }
  }
  // stat-effect-only or empty plan: no meaningful strength axis
  return 'neutral';
}

// ─── Plan-based builder ───────────────────────────────────────────────────────

export function buildSkillPreviewModelFromPlan(
  plan: SkillUsePlan,
  input: SkillPreviewInput,
): SkillPreviewModel | null {
  const { activeUnit, targetCoord, occupancy, unitsById, deployments } = input;
  if (!activeUnit) return null;

  const highlight: 'damage' | 'heal' | 'revive' = isDeadFriendlyTargetPolicy(
    plan.targetPolicy,
  )
    ? 'revive'
    : isHealTargetPolicy(plan)
      ? 'heal'
      : 'damage';
  const cells: SkillPreviewCell[] = [];
  const statusLines: string[] = [];

  for (const action of plan.actions) {
    // ── Cells ─────────────────────────────────────────────────────────────

    if (action.type === 'damage' || action.type === 'heal') {
      const pattern = resolvePlanPattern(action.matrix);
      const hitCells = resolvePattern(targetCoord, pattern);
      for (const hit of hitCells) {
        cells.push({
          coord: hit.coord,
          kind: 'skill',
          highlight,
          multiplier: hit.multiplier,
        });
      }
    }

    if (
      action.type === 'apply_stat_effect' ||
      action.type === 'apply_periodic_hp_effect' ||
      action.type === 'probability_effect'
    ) {
      const pattern = resolvePlanPattern(action.matrix);
      const effectCells = resolvePattern(targetCoord, pattern);
      for (const ec of effectCells) {
        cells.push({ coord: ec.coord, kind: 'effect', highlight });
      }

      if (action.type === 'probability_effect') {
        statusLines.push(`[${action.probabilityEffect.displayName} ${formatProbability(effectCells)}]`);
      }
    }

    // post_damage: no cells in preview (no own matrix; depends on prior real damage).

    // ── Status lines ──────────────────────────────────────────────────────

    if (action.type === 'heal') {
      const baseHeal = getUnitPowerFromEffectiveStats(activeUnit.effectiveStats, action.powerSource);
      const pattern = resolvePlanPattern(action.matrix);
      const hitCells = resolvePattern(targetCoord, pattern);

      const healByUnitId = new Map<string, number>();
      for (const hit of hitCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(hit.coord));
        const unit = unitId ? unitsById.get(unitId) : undefined;
        if (!unit) continue;
        const amount = Math.round(baseHeal * hit.multiplier);
        const prev = healByUnitId.get(unit.id) ?? 0;
        if (amount > prev) healByUnitId.set(unit.id, amount);
      }

      for (const [unitId, rawAmount] of healByUnitId) {
        const unit = unitsById.get(unitId)!;
        const applied = Math.min(rawAmount, unit.maxHp - unit.hp);
        if (applied === 0) continue;
        statusLines.push(`${unit.name} +${applied}`);
      }
    }

    if (action.type === 'damage') {
      // effectiveStats already has active effects applied, matching the executor.
      const baseDamage = getUnitPowerFromEffectiveStats(activeUnit.effectiveStats, action.powerSource);

      const ignorePercent: Partial<Record<string, number>> = {};
      if (action.modifiers) {
        for (const block of action.modifiers) {
          ignorePercent[block.type] = getDamageModifierPercent(block);
        }
      }
      const defIgnoreKey = getDefenseIgnoreModifierTypeForPowerSource(action.powerSource);
      const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

      const pattern = resolvePlanPattern(action.matrix);
      const hitCells = resolvePattern(targetCoord, pattern);

      const damageByUnitId = new Map<string, number>();
      for (const hit of hitCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(hit.coord));
        const unit = unitId ? unitsById.get(unitId) : undefined;
        if (!unit) continue;
        const dmg = computeDamageVsEffectiveStats(baseDamage, action.powerSource, unit.effectiveStats, hit.multiplier, defIgnore);
        const prev = damageByUnitId.get(unit.id) ?? 0;
        if (dmg > prev) damageByUnitId.set(unit.id, dmg);
      }

      for (const [unitId, dmg] of damageByUnitId) {
        const unit = unitsById.get(unitId)!;
        statusLines.push(`${unit.name} ~${dmg}`);
      }
    }

    if (
      action.type === 'apply_stat_effect' ||
      action.type === 'apply_periodic_hp_effect'
    ) {
      statusLines.push(`[${action.effect.displayName}]`);
    }

    if (action.type === 'apply_periodic_hp_effect') {
      const pattern = resolvePlanPattern(action.matrix);
      const basePower = getUnitPowerFromEffectiveStats(activeUnit.effectiveStats, action.powerSource);
      const hitCells = resolvePattern(targetCoord, pattern);

      const amountByUnitId = new Map<string, number>();
      for (const hit of hitCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(hit.coord));
        if (!unitId) continue;
        const amount = computePeriodicHpAmount(basePower, hit.multiplier);
        const prev = amountByUnitId.get(unitId);
        if (prev === undefined || amount > prev) amountByUnitId.set(unitId, amount);
      }

      for (const [unitId, amount] of amountByUnitId) {
        const unit = unitsById.get(unitId);
        if (!unit) continue;
        const sign = action.direction === 'heal' ? '+' : '-';
        statusLines.push(`${unit.name} ${sign}${amount} HP/round`);
      }
    }

    if (action.type === 'post_damage') {
      const pct = getVampirismPercent(action.postDamage);
      const label = action.postDamage.type === 'self_vampirism' ? 'Self vampirism' : 'Mass vampirism';
      statusLines.push(`[${label} ${pct}%]`);
    }

    if (action.type === 'revive') {
      const { targets } = resolveReviveTargetsForAction({
        units: unitsById,
        deployments,
        casterSide: activeUnit.side,
        targetAnchor: targetCoord,
        matrix: action.matrix,
      });

      for (const { unit, cells: corpseCells } of targets) {
        for (const cell of corpseCells) {
          cells.push({ coord: cell, kind: 'effect', highlight: 'revive' });
        }
        const hp = computeReviveHp(unit, action.revive);
        statusLines.push(`${unit.name} revived +${hp} HP`);
      }
    }
  }

  const colorKind = getPreviewHeaderColorKindFromPlan(plan);

  return {
    cells,
    statusHeader: { text: plan.name, colorKind },
    statusLines,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildSkillPreviewModel(
  input: SkillPreviewInput,
): SkillPreviewModel | null {
  const { activeUnit } = input;
  if (!activeUnit) return null;

  const skill = getActiveSkill(activeUnit);
  const plan = compileSkillUsePlan(skill);
  return buildSkillPreviewModelFromPlan(plan, input);
}

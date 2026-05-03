import type { CellCoord } from '../shared/gridTypes';
import type { ActiveEffect } from '../shared/activeEffect';
import type { Skill } from '../shared/skillTypes';
import type {
  SkillPreviewCell,
  SkillPreviewHeaderColorKind,
  SkillPreviewModel,
} from '../shared/skillPreviewModel';
import { getActiveSkill } from './skillRuntime';
import { computeDamageVsUnit } from './combat';
import { resolvePattern } from './skillPatterns';
import { getDamageModifierPercent } from './skillDefinitionRuntime';
import { cellKey } from './field';
import {
  compileLegacySkill,
  resolvePlanPattern,
  getRawUnitPower,
  getEffectiveUnitPower,
  getDamageTypeForPowerSource,
} from './skillUsePlan';
import type { SkillUsePlan } from './skillUsePlan';

export type { SkillPreviewModel } from '../shared/skillPreviewModel';

// ─── Input types ──────────────────────────────────────────────────────────────
// Defined locally to avoid importing BattleUnitSnapshot (a scene-facing snapshot
// contract). BattleUnitSnapshot is structurally compatible and satisfies this type.

export type SkillPreviewUnit = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
  activeEffects: readonly ActiveEffect[];
  skills: readonly Skill[];
  activeSkillIndex: number;
};

export type SkillPreviewInput = {
  activeUnit: SkillPreviewUnit | null;
  targetCoord: CellCoord;
  occupancy: {
    cellToUnitId: ReadonlyMap<string, string>;
  };
  unitsById: ReadonlyMap<string, SkillPreviewUnit>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isHealTargetPolicy(plan: SkillUsePlan): boolean {
  return plan.targetPolicy.type === 'friendly' || plan.targetPolicy.type === 'self';
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
  const { activeUnit, targetCoord, occupancy, unitsById } = input;
  if (!activeUnit) return null;

  const highlight = isHealTargetPolicy(plan) ? 'heal' : 'damage';
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
      action.type === 'apply_periodic_hp_effect'
    ) {
      const pattern = resolvePlanPattern(action.matrix);
      const effectCells = resolvePattern(targetCoord, pattern);
      for (const ec of effectCells) {
        cells.push({ coord: ec.coord, kind: 'effect', highlight });
      }
    }

    // post_damage and instant_effect: no cells in preview.

    // ── Status lines ──────────────────────────────────────────────────────

    if (action.type === 'heal') {
      // Raw power matches applyLegacyEnchantmentHealing (raw, not effective).
      // legacy_enchantment_heal_power resolves to unit.magicalDamage — see getRawUnitPower.
      const baseHeal = getRawUnitPower(activeUnit, action.powerSource);
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
      const damageType = getDamageTypeForPowerSource(action.powerSource);
      // getEffectiveUnitPower applies active effects, matching applyLegacyHostileDamage.
      const baseDamage = getEffectiveUnitPower(activeUnit, action.powerSource);

      const ignorePercent: Partial<Record<string, number>> = {};
      if (action.modifiers) {
        for (const block of action.modifiers) {
          ignorePercent[block.type] = getDamageModifierPercent(block);
        }
      }
      const defIgnoreKey =
        damageType === 'physical' ? 'ignore_physical_defense' : 'ignore_magical_defense';
      const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

      const pattern = resolvePlanPattern(action.matrix);
      const hitCells = resolvePattern(targetCoord, pattern);

      const damageByUnitId = new Map<string, number>();
      for (const hit of hitCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(hit.coord));
        const unit = unitId ? unitsById.get(unitId) : undefined;
        if (!unit) continue;
        const dmg = computeDamageVsUnit(baseDamage, damageType, unit, hit.multiplier, defIgnore);
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
      statusLines.push(`[${action.effectBlock.effectDisplayName}]`);
    }

    if (action.type === 'apply_periodic_hp_effect') {
      // Anchor-cell multiplier only. The executor uses only the anchor for per-turn
      // scaling; non-anchor cells define targeting area, not power.
      const pattern = resolvePlanPattern(action.matrix);
      const anchorCell = pattern.cells[pattern.anchorRow][pattern.anchorCol]!;
      const basePower = getRawUnitPower(activeUnit, action.powerSource);
      const amount = Math.round(basePower * anchorCell.damageMultiplier);

      const effectCells = resolvePattern(targetCoord, pattern);
      const seenUnits = new Set<string>();
      for (const ec of effectCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(ec.coord));
        const unit = unitId ? unitsById.get(unitId) : undefined;
        if (!unit || seenUnits.has(unit.id)) continue;
        seenUnits.add(unit.id);
        const sign = action.direction === 'heal' ? '+' : '-';
        statusLines.push(`${unit.name} ${sign}${amount} HP/round`);
      }
    }

    // post_damage and instant_effect: no status lines in preview.
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
  const plan = compileLegacySkill(skill);
  return buildSkillPreviewModelFromPlan(plan, input);
}

import type { CellCoord } from '../shared/gridTypes';
import type { ActiveEffect } from '../shared/activeEffect';
import type { Skill } from '../shared/skillTypes';
import type {
  SkillPreviewCell,
  SkillPreviewHeaderColorKind,
  SkillPreviewModel,
} from '../shared/skillPreviewModel';
import {
  getActiveSkill,
  getSkillHitCellsForSkill,
  isEnchantmentSkill,
  resolveEffectArgs,
} from './skillRuntime';
import { effectiveStats, computeDamageVsUnit } from './combat';
import { resolvePattern } from './skillPatterns';
import { getDamageModifierPercent, getEffectPattern } from './skillDefinitionRuntime';
import { cellKey } from './field';

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

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildSkillPreviewModel(
  input: SkillPreviewInput,
): SkillPreviewModel | null {
  const { activeUnit, targetCoord, occupancy, unitsById } = input;
  if (!activeUnit) return null;

  const skill = getActiveSkill(activeUnit);
  const isHeal = isEnchantmentSkill(skill);

  // ── Cells ────────────────────────────────────────────────────────────────

  const cells: SkillPreviewCell[] = [];

  const hitCells = getSkillHitCellsForSkill(skill, targetCoord);
  for (const hit of hitCells) {
    cells.push({
      coord: hit.coord,
      kind: 'skill',
      highlight: isHeal ? 'heal' : 'damage',
      multiplier: hit.multiplier,
    });
  }

  const effectCells = skill.effectBlock
    ? resolvePattern(targetCoord, getEffectPattern(skill.effectBlock))
    : [];

  for (const ec of effectCells) {
    cells.push({
      coord: ec.coord,
      kind: 'effect',
      highlight: isHeal ? 'heal' : 'damage',
    });
  }

  // ── Status lines ─────────────────────────────────────────────────────────

  const statusLines: string[] = [];

  if (isHeal) {
    // Matches resolveHealWithEvents: raw magicalDamage (not effectiveStats),
    // rounded, deduped by highest heal per unit, capped by missing HP, skip zeros.
    const healByUnitId = new Map<string, number>();
    for (const hit of hitCells) {
      const unitId = occupancy.cellToUnitId.get(cellKey(hit.coord));
      const unit = unitId ? unitsById.get(unitId) : undefined;
      if (!unit) continue;
      const amount = Math.round(activeUnit.magicalDamage * hit.multiplier);
      const prev = healByUnitId.get(unit.id) ?? 0;
      if (amount > prev) healByUnitId.set(unit.id, amount);
    }
    for (const [unitId, rawAmount] of healByUnitId) {
      const unit = unitsById.get(unitId)!;
      const applied = Math.min(rawAmount, unit.maxHp - unit.hp);
      if (applied === 0) continue;
      statusLines.push(`${unit.name} +${applied}`);
    }
  } else {
    // Matches resolveAttack: effectiveStats for attacker, defense ignore,
    // computeDamageVsUnit, deduped by highest damage per unit.
    const damageType = skill.damageBlock?.damageType ?? 'physical';
    const attackerStats = effectiveStats(activeUnit);
    const baseDamage =
      damageType === 'physical'
        ? attackerStats.physicalDamage
        : attackerStats.magicalDamage;

    const ignorePercent: Partial<Record<string, number>> = {};
    if (skill.damageModifierBlocks) {
      for (const block of skill.damageModifierBlocks) {
        ignorePercent[block.type] = getDamageModifierPercent(block);
      }
    }
    const defIgnoreKey =
      damageType === 'physical' ? 'ignore_physical_defense' : 'ignore_magical_defense';
    const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

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

  // ── Effect text lines ─────────────────────────────────────────────────────

  if (skill.effectBlock) {
    statusLines.push(`[${skill.effectBlock.effectDisplayName}]`);

    const [resolvedEffect, computedPerTurn] = resolveEffectArgs(skill, activeUnit);
    if (computedPerTurn !== undefined) {
      const sign = resolvedEffect.isBuff ? '+' : '-';
      const seenEffect = new Set<string>();
      for (const ec of effectCells) {
        const unitId = occupancy.cellToUnitId.get(cellKey(ec.coord));
        const unit = unitId ? unitsById.get(unitId) : undefined;
        if (!unit || seenEffect.has(unit.id)) continue;
        seenEffect.add(unit.id);
        statusLines.push(`${unit.name} ${sign}${computedPerTurn} HP/round`);
      }
    }
  }

  // ── Header color ──────────────────────────────────────────────────────────

  const colorKind: SkillPreviewHeaderColorKind =
    skill.damageBlock?.damageType === 'magical'
      ? 'magical'
      : skill.damageBlock?.damageType === 'physical'
        ? 'physical'
        : 'neutral';

  return {
    cells,
    statusHeader: { text: skill.name, colorKind },
    statusLines,
  };
}

import type { GamePhase } from '../core/phases';
import type { CellCoord } from '../shared/gridTypes';
import { cellKey } from '../battle/field';
import {
  getActiveSkill,
  getSkillHitCells,
  isEnchantmentSkill,
  resolveEffectArgs,
} from '../battle/skillRuntime';
import { effectiveStats, computeDamageVsUnit } from '../battle/combat';
import { resolvePattern } from '../battle/skillPatterns';
import { getDamageModifierPercent, getEffectPattern } from '../battle/skillDefinitionRuntime';

// ─── Local alias ──────────────────────────────────────────────────────────────

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

// ─── Public types ─────────────────────────────────────────────────────────────

export type BattleSkillPreviewHighlightKind = 'damage' | 'heal';

export type BattleSkillPreviewHeaderColorKind = 'physical' | 'magical' | 'neutral';

export type BattleSkillPreviewCell =
  | {
      coord: CellCoord;
      kind: 'skill';
      highlight: BattleSkillPreviewHighlightKind;
      multiplier: number;
    }
  | {
      coord: CellCoord;
      kind: 'effect';
      highlight: BattleSkillPreviewHighlightKind;
    };

export type BattleSkillPreviewPresentation = {
  cells: BattleSkillPreviewCell[];
  statusHeader: {
    text: string;
    colorKind: BattleSkillPreviewHeaderColorKind;
  };
  statusBody: string;
};

// ─── Public function ──────────────────────────────────────────────────────────

export function buildBattleSkillPreviewPresentation(input: {
  phase: BattlePhase;
  coord: CellCoord;
}): BattleSkillPreviewPresentation | null {
  const { phase, coord } = input;
  const activeUnit = phase.activeUnit;
  if (!activeUnit) return null;

  const skill = getActiveSkill(activeUnit);
  const isHeal = isEnchantmentSkill(skill);

  // ── Cells ─────────────────────────────────────────────────────────────────

  const cells: BattleSkillPreviewCell[] = [];

  const hitCells = getSkillHitCells(activeUnit, coord);
  for (const hit of hitCells) {
    cells.push({
      coord: hit.coord,
      kind: 'skill',
      highlight: isHeal ? 'heal' : 'damage',
      multiplier: hit.multiplier,
    });
  }

  // Computed once; reused for both the cell list and effect text lines.
  const effectCells = skill.effectBlock
    ? resolvePattern(coord, getEffectPattern(skill.effectBlock))
    : [];

  for (const ec of effectCells) {
    cells.push({
      coord: ec.coord,
      kind: 'effect',
      highlight: isHeal ? 'heal' : 'damage',
    });
  }

  // ── Preview body lines ────────────────────────────────────────────────────

  const previewParts: string[] = [];
  const seen = new Set<string>();

  if (isHeal) {
    const healAmount = effectiveStats(activeUnit).magicalDamage;
    for (const hit of hitCells) {
      const unitId = phase.occupancy.cellToUnitId.get(cellKey(hit.coord));
      const unit = unitId ? phase.unitsById.get(unitId) : undefined;
      if (!unit || seen.has(unit.id)) continue;
      seen.add(unit.id);
      previewParts.push(`${unit.name} +${healAmount}`);
    }
  } else {
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

    for (const hit of hitCells) {
      const unitId = phase.occupancy.cellToUnitId.get(cellKey(hit.coord));
      const unit = unitId ? phase.unitsById.get(unitId) : undefined;
      if (!unit || seen.has(unit.id)) continue;
      seen.add(unit.id);
      const dmg = computeDamageVsUnit(baseDamage, damageType, unit, hit.multiplier, defIgnore);
      previewParts.push(`${unit.name} ~${dmg}`);
    }
  }

  // ── Effect text lines ─────────────────────────────────────────────────────

  if (skill.effectBlock) {
    previewParts.push(`[${skill.effectBlock.effectDisplayName}]`);

    const [resolvedEffect, computedPerTurn] = resolveEffectArgs(skill, activeUnit);
    if (computedPerTurn !== undefined) {
      const sign = resolvedEffect.isBuff ? '+' : '-';
      const seenEffect = new Set<string>();
      for (const ec of effectCells) {
        const unitId = phase.occupancy.cellToUnitId.get(cellKey(ec.coord));
        const unit = unitId ? phase.unitsById.get(unitId) : undefined;
        if (!unit || seenEffect.has(unit.id)) continue;
        seenEffect.add(unit.id);
        previewParts.push(`${unit.name} ${sign}${computedPerTurn} HP/round`);
      }
    }
  }

  // ── Assemble ──────────────────────────────────────────────────────────────

  const colorKind: BattleSkillPreviewHeaderColorKind =
    skill.damageBlock?.damageType === 'magical'
      ? 'magical'
      : skill.damageBlock?.damageType === 'physical'
        ? 'physical'
        : 'neutral';

  return {
    cells,
    statusHeader: { text: skill.name, colorKind },
    statusBody: `Preview:\n${previewParts.join('\n')}\n[click again to confirm]`,
  };
}

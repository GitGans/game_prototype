import type { Unit, BattleState } from '../battle/types';
import type { BattleUnitSnapshot, BattleOccupancySnapshot } from '../shared/battleSnapshots';
import { effectiveStats } from '../battle/combat';

export function buildBattleUnitSnapshot(unit: Unit): BattleUnitSnapshot {
  const eff = effectiveStats(unit);
  return {
    id:       unit.id,
    name:     unit.name,
    hp:       unit.hp,
    maxHp:    unit.maxHp,

    physicalStrength:    unit.physicalStrength,
    magicalStrength:     unit.magicalStrength,
    physicalDefense:     unit.physicalDefense,
    magicalDefense:      unit.magicalDefense,
    dodge:               unit.dodge,
    block:               unit.block,
    level:               unit.level,
    initiative:          unit.initiative,
    effectiveInitiative:       eff.initiative,
    effectivePhysicalStrength: eff.physicalStrength,
    effectiveMagicalStrength:  eff.magicalStrength,
    effectivePhysicalDefense: eff.physicalDefense,
    effectiveMagicalDefense:  eff.magicalDefense,
    effectiveDodge:           eff.dodge,
    effectiveBlock:           eff.block,

    shape:  unit.shape,
    anchor: { ...unit.anchor },

    skills:           unit.skills,
    activeSkillIndex: unit.activeSkillIndex,
    activeEffects:    unit.activeEffects,

    rowTrait:   unit.rowTrait,
    templateId: unit.templateId,
    spriteSheet: unit.spriteSheet,

    activatableAbilities: unit.activatableAbilities,
  };
}

export function buildBattleUnitSnapshots(
  units: Map<string, Unit>,
): BattleUnitSnapshot[] {
  return Array.from(units.values()).map(buildBattleUnitSnapshot);
}

export function buildBattleOccupancySnapshot(state: BattleState): BattleOccupancySnapshot {
  const cellToUnitId = new Map<string, string>();
  for (const [key, unit] of state.occupancy.cellToUnit) {
    cellToUnitId.set(key, unit.id);
  }

  const unitToCells = new Map(
    Array.from(state.occupancy.unitToCells, ([id, cells]) => [
      id,
      cells.map(c => ({ ...c })),
    ]),
  );

  return { cellToUnitId, unitToCells };
}

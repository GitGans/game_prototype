import type { Unit, BattleState } from '../battle/types';
import type { BattleUnitSnapshot, BattleOccupancySnapshot } from '../shared/battleSnapshots';
import type { CellCoord } from '../shared/gridTypes';
import { effectiveStats } from '../battle/combat';
import { getFieldUnitEntries } from '../battle/deployment';

// fieldAnchor comes from the unit's deployment, not from Unit itself (Unit no longer has anchor).
export function buildBattleUnitSnapshot(unit: Unit, fieldAnchor: CellCoord): BattleUnitSnapshot {
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
    effectivePhysicalDefense:  eff.physicalDefense,
    effectiveMagicalDefense:   eff.magicalDefense,
    effectiveDodge:            eff.dodge,
    effectiveBlock:            eff.block,

    shape:  unit.shape,
    anchor: { ...fieldAnchor },

    skills:           unit.skills,
    activeSkillIndex: unit.activeSkillIndex,
    activeEffects:    unit.activeEffects,

    rowTrait:   unit.rowTrait,
    templateId: unit.templateId,
    spriteSheet: unit.spriteSheet,

    activatableAbilities: unit.activatableAbilities,
  };
}

// Only field-deployed units are included in the field snapshot.
// Bench units are rendered via the benchUnits mirror path (BenchUnitSnapshot).
export function buildBattleUnitSnapshots(state: BattleState): BattleUnitSnapshot[] {
  return getFieldUnitEntries(state).map(([, unit]) => {
    const deployment = state.deployments.get(unit.id)!;
    if (deployment.kind !== 'field') throw new Error('buildBattleUnitSnapshots: invariant violation — non-field unit from getFieldUnitEntries');
    return buildBattleUnitSnapshot(unit, deployment.anchor);
  });
}

export function buildBattleOccupancySnapshot(state: BattleState): BattleOccupancySnapshot {
  const cellToUnitId = new Map(state.occupancy.cellToUnitId); // direct copy, no conversion

  const unitToCells = new Map(
    Array.from(state.occupancy.unitToCells, ([id, cells]) => [
      id,
      cells.map(c => ({ ...c })),
    ]),
  );

  return { cellToUnitId, unitToCells };
}

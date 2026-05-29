import type { Unit, BattleState } from '../battle/types';
import type {
  BattleUnitSnapshot,
  FieldBattleUnitSnapshot,
  BattleOccupancySnapshot,
  BattleFieldUnitCellsSnapshot,
} from '../shared/battleSnapshots';
import type { CellCoord } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import { effectiveStats } from '../battle/combat';
import { requireDeployment } from '../battle/deployment';
import { cellKey } from '../battle/field';
import { getOccupiedCells } from '../battle/shapes';
import { isAlive, isDead } from '../battle/lifeState';
import { getUnitSpriteTextureKey } from './unitSpriteKey';

function cloneDeployment(d: UnitDeployment): UnitDeployment {
  return d.kind === 'field'
    ? { kind: 'field', anchor: { ...d.anchor } }
    : { kind: 'bench', slot: d.slot };
}

export function buildBattleUnitSnapshot(
  unit: Unit,
  runtimeDeployment: UnitDeployment,
): BattleUnitSnapshot {
  const eff        = effectiveStats(unit);
  const deployment = cloneDeployment(runtimeDeployment);
  const spriteKey  = unit.spriteSheet
    ? getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet)
    : null;

  const snap: BattleUnitSnapshot = {
    id:        unit.id,
    side:      unit.side,
    name:      unit.name,
    hp:        unit.hp,
    maxHp:     unit.maxHp,
    lifeState: unit.lifeState,

    physicalStrength: unit.physicalStrength,
    magicalStrength:  unit.magicalStrength,
    physicalDefense:  unit.physicalDefense,
    magicalDefense:   unit.magicalDefense,
    dodge:            unit.dodge,
    block:            unit.block,
    level:            unit.level,
    initiative:       unit.initiative,
    effectiveInitiative:       eff.initiative,
    effectivePhysicalStrength: eff.physicalStrength,
    effectiveMagicalStrength:  eff.magicalStrength,
    effectivePhysicalDefense:  eff.physicalDefense,
    effectiveMagicalDefense:   eff.magicalDefense,
    effectiveDodge:            eff.dodge,
    effectiveBlock:            eff.block,

    shape:      unit.shape,
    deployment,
    spriteKey,

    skills:           unit.skills,
    activeSkillIndex: unit.activeSkillIndex,
    activeEffects:    unit.activeEffects,

    rowTrait:    unit.rowTrait,
    templateId:  unit.templateId,
    spriteSheet: unit.spriteSheet,

    activatableAbilities: unit.activatableAbilities,
  };
  return snap;
}

export function buildBattleUnitSnapshots(state: BattleState): BattleUnitSnapshot[] {
  return Array.from(state.units.values()).map(u =>
    buildBattleUnitSnapshot(u, requireDeployment(state, u.id)),
  );
}

function isFieldSnapshot(s: BattleUnitSnapshot): s is FieldBattleUnitSnapshot {
  return s.deployment.kind === 'field';
}

export function buildFieldBattleUnitSnapshots(
  state: BattleState,
): FieldBattleUnitSnapshot[] {
  return buildBattleUnitSnapshots(state).filter(isFieldSnapshot);
}

export function buildBenchBattleUnitSnapshots(
  state: BattleState,
): (BattleUnitSnapshot | null)[] {
  const slots: (BattleUnitSnapshot | null)[] =
    Array.from({ length: state.benchSlotCount }, () => null);
  for (const unit of state.units.values()) {
    const dep = requireDeployment(state, unit.id);
    if (dep.kind !== 'bench') continue;
    const existing = slots[dep.slot];
    if (existing) {
      throw new Error(
        `buildBenchBattleUnitSnapshots: bench slot ${dep.slot} claimed by ` +
        `both "${existing.id}" and "${unit.id}"`,
      );
    }
    slots[dep.slot] = buildBattleUnitSnapshot(unit, dep);
  }
  return slots;
}

// Living/blocking only. Dead units are excluded upstream by
// battle/occupancy.ts. For all field bodies including dead, use
// buildBattleFieldUnitCellsSnapshot.
export function buildBattleOccupancySnapshot(state: BattleState): BattleOccupancySnapshot {
  const cellToUnitId = new Map(state.occupancy.cellToUnitId);
  const unitToCells  = new Map(
    Array.from(state.occupancy.unitToCells, ([id, cells]) => [
      id,
      cells.map(c => ({ ...c })),
    ]),
  );
  return { cellToUnitId, unitToCells };
}

// All field-deployed units, alive and dead, both sides. Cell arrays are
// ordered living-first then dead, preserving state.units insertion order
// within each group. Uses cellKey() identical to occupancy, so the scene
// can probe both maps with the same cell key.
//
// Uses isAlive/isDead from battle/lifeState. Note: !isAlive ≠ isDead by
// design — the helpers are intentionally not strict complements. We pass
// each predicate explicitly to keep semantics aligned with combat rules.
export function buildBattleFieldUnitCellsSnapshot(
  state: BattleState,
): BattleFieldUnitCellsSnapshot {
  const cellToUnitIds = new Map<string, string[]>();
  const unitToCells   = new Map<string, CellCoord[]>();

  const ordered = Array.from(state.units.values());
  const passes: ((u: Unit) => boolean)[] = [isAlive, isDead];

  for (const passPredicate of passes) {
    for (const unit of ordered) {
      if (!passPredicate(unit)) continue;
      const dep = requireDeployment(state, unit.id);
      if (dep.kind !== 'field') continue;

      const cells = getOccupiedCells(dep.anchor, unit.shape).map(c => ({ ...c }));
      unitToCells.set(unit.id, cells);

      for (const c of cells) {
        const key = cellKey(c);
        const arr = cellToUnitIds.get(key);
        if (arr) arr.push(unit.id);
        else cellToUnitIds.set(key, [unit.id]);
      }
    }
  }
  return { cellToUnitIds, unitToCells };
}

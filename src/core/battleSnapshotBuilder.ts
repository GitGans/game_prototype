import type { Unit, BattleState } from '../battle/types';
import type {
  BattleUnitSnapshot,
  FieldBattleUnitSnapshot,
  BattleOccupancySnapshot,
} from '../shared/battleSnapshots';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import { effectiveStats } from '../battle/combat';
import { requireDeployment } from '../battle/deployment';
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
    id:       unit.id,
    side:     unit.side,
    name:     unit.name,
    hp:       unit.hp,
    maxHp:    unit.maxHp,

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
  if (deployment.kind === 'field') {
    snap.anchor = { ...deployment.anchor };
  }
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

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

/**
 * Projects the transient preview target into render fields.
 *
 * Safety net against stale highlights: the preview is exposed only while the player is
 * actually choosing a target for the current active unit, and only if the stored coord is
 * still a valid target. If anything drifts, both fields collapse to null even if an explicit
 * clear was missed.
 *
 * Strict policy-aware id resolution: `fieldUnitCells.cellToUnitIds` lists living units before
 * dead ones, so a corpse sharing a cell with a living unit would resolve wrong via `[0]`. We
 * pick the candidate whose life state matches the highlight kind (revive → dead, otherwise
 * alive). If NO candidate matches, return null — never fall back to the first id, which would
 * reintroduce the exact wrong-unit highlight the policy match exists to prevent.
 */
export function projectPreviewTarget(input: {
  battlePhase:         BattleState['phase'];
  previewTargetCoord:  CellCoord | null;
  validTargets:        CellCoord[];
  hasActiveUnit:       boolean;
  fieldUnitCells:      BattleFieldUnitCellsSnapshot;
  unitsById:           Map<string, BattleUnitSnapshot>;
  targetHighlightKind: 'target' | 'heal_target' | 'revive_target' | 'none';
}): { previewTargetCoord: CellCoord | null; previewTargetUnitId: string | null } {
  const { battlePhase, previewTargetCoord, validTargets, hasActiveUnit,
          fieldUnitCells, unitsById, targetHighlightKind } = input;

  const isValid =
    battlePhase === 'select_target' &&
    hasActiveUnit &&
    previewTargetCoord !== null &&
    validTargets.some(c => cellKey(c) === cellKey(previewTargetCoord));

  if (!isValid) return { previewTargetCoord: null, previewTargetUnitId: null };

  const ids = fieldUnitCells.cellToUnitIds.get(cellKey(previewTargetCoord!)) ?? [];
  const wantDead = targetHighlightKind === 'revive_target';
  // Strict: only a life-state match counts. No `?? ids[0]` fallback.
  const previewTargetUnitId =
    ids.find(id => {
      const u = unitsById.get(id);
      return u ? (wantDead ? u.lifeState === 'dead' : u.lifeState !== 'dead') : false;
    }) ?? null;

  return { previewTargetCoord: { ...previewTargetCoord! }, previewTargetUnitId };
}

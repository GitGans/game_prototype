import type { Unit, BattleState } from '../battle/types';
import type {
  BattleUnitSnapshot,
  FieldBattleUnitSnapshot,
  BattleOccupancySnapshot,
  BattleFieldUnitCellsSnapshot,
} from '../shared/battleSnapshots';
import type { UnitStatsSnapshot } from '../shared/snapshotTypes';
import type { CellCoord, UnitShape } from '../shared/gridTypes';
import type { ActiveEffect } from '../shared/activeEffect';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import { effectiveStats } from '../battle/combat';
import { requireDeployment } from '../battle/deployment';
import { cellKey } from '../battle/field';
import { getOccupiedCells } from '../battle/shapes';
import { isAlive, isDead } from '../battle/lifeState';
import { resolveUnitClassDefinition } from '../progression';
import { getUnitSpriteTextureKey } from './unitSpriteKey';

function cloneDeployment(d: UnitDeployment): UnitDeployment {
  return d.kind === 'field'
    ? { kind: 'field', anchor: { ...d.anchor } }
    : { kind: 'bench', slot: d.slot };
}

// `unit.shape` aliases an entry in the shared SHAPES registry (data/shapeDefinitions.ts) —
// every unit of the same shape holds the SAME object. Handing it to a scene by reference
// would let one mutation corrupt that shape for the whole process. <=4 offsets, so the copy
// is free.
function cloneShape(shape: UnitShape): UnitShape {
  return { offsets: shape.offsets.map(o => ({ ...o })) };
}

// activeEffects is runtime-owned and mutable at every depth. `Effect` is a flat record, so
// a shallow copy of it is a complete copy. <=2 effects per unit.
function cloneActiveEffect(ae: ActiveEffect): ActiveEffect {
  const copy: ActiveEffect = {
    effectDisplayName: ae.effectDisplayName,
    effect:            { ...ae.effect },
    remainingRounds:   ae.remainingRounds,
  };
  // Optional by contract — assign only when present, so the copy keeps the same key shape
  // instead of gaining an explicit `periodicHp: undefined`.
  if (ae.periodicHp) copy.periodicHp = { ...ae.periodicHp };
  return copy;
}

/**
 * Projects one runtime unit into its scene-facing snapshot.
 *
 * VALUE ISOLATION CONTRACT — no field of the result aliases runtime-owned mutable state.
 * `shape`, `deployment`, `sprite.states`, the `skills` array and `activeEffects` (including
 * each nested `effect` / `periodicHp`) are all copies. The only references shared with
 * another layer are the `ActionSkillDefinition` entries inside `skills`: shared, immutable
 * static content from the SKILLS registry, exposed as `readonly` and mutated by no layer.
 */
export function buildBattleUnitSnapshot(
  unit: Unit,
  runtimeDeployment: UnitDeployment,
): BattleUnitSnapshot {
  const eff        = effectiveStats(unit);
  const deployment = cloneDeployment(runtimeDeployment);
  // states is copied: SpriteSheetConfig.states is mutable runtime config; the
  // snapshot must not share a reference. Order = spritesheet frame order.
  const sprite = unit.spriteSheet
    ? {
        textureKey: getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet),
        states: [...unit.spriteSheet.states],
      }
    : null;
  const className  = resolveUnitClassDefinition(unit.classId).name;
  const hb         = unit.statHighlightBaseStats;

  const statDisplay: UnitStatsSnapshot = {
    level: unit.level,
    // HP row: lost current HP must NOT read as a debuff. The row is colored by maxHp
    // (UnitTooltip does this). hp itself stays neutral (value === highlightBase).
    hp:    { highlightBase: unit.hp, value: unit.hp },
    maxHp: { highlightBase: hb.hp,   value: unit.maxHp },

    physicalStrength: { highlightBase: hb.physicalStrength, value: eff.physicalStrength },
    magicalStrength:  { highlightBase: hb.magicalStrength,  value: eff.magicalStrength  },
    physicalDefense:  { highlightBase: hb.physicalDefense,  value: eff.physicalDefense  },
    magicalDefense:   { highlightBase: hb.magicalDefense,   value: eff.magicalDefense   },
    dodge:            { highlightBase: hb.dodge,            value: eff.dodge            },
    block:            { highlightBase: hb.block,            value: eff.block            },
    initiative:       { highlightBase: hb.initiative,       value: eff.initiative       },
  };

  const snap: BattleUnitSnapshot = {
    id:        unit.id,
    side:      unit.side,
    name:      unit.name,
    className,
    currentHp: unit.hp,
    maxHp:     unit.maxHp,
    lifeState: unit.lifeState,

    statDisplay,

    shape:      cloneShape(unit.shape),
    deployment,
    sprite,

    // The array is per-unit and mutable, so it is copied. Its ActionSkillDefinition
    // entries are deliberately NOT deep-cloned: they are shared, immutable static content
    // from the SKILLS registry, not runtime state, and cloning whole skill trees on every
    // snapshot rebuild would land on a hot path (battle_preview_target fires on pointer move).
    skills:           [...unit.skills],
    activeSkillIndex: unit.activeSkillIndex,
    activeEffects:    unit.activeEffects.map(cloneActiveEffect),

    rowTrait:    unit.rowTrait,
    templateId:  unit.templateId,
  };
  return snap;
}

function isFieldSnapshot(s: BattleUnitSnapshot): s is FieldBattleUnitSnapshot {
  return s.deployment.kind === 'field';
}

export interface BattleUnitSnapshotViews {
  unitsById:  Map<string, BattleUnitSnapshot>;
  fieldUnits: FieldBattleUnitSnapshot[];
  benchUnits: (BattleUnitSnapshot | null)[];
}

/**
 * CANONICAL battle phase unit read-model builder.
 *
 * Single-pass projection of BattleState.units into the three battle read-model views.
 * Each runtime unit is converted to exactly one BattleUnitSnapshot; all three views
 * reference the same instances. Iteration follows state.units insertion order, so
 * unitsById and fieldUnits preserve that order (same as the previous helpers).
 *
 * Production code that needs a full battle phase read model (i.e. battlePhaseSnapshot.ts's
 * buildBattlePhaseSnapshot) MUST use this builder so the views share one snapshot object set.
 * The array helpers below are compatibility/test conveniences, not the production API.
 */
export function buildBattleUnitSnapshotViews(
  state: BattleState,
): BattleUnitSnapshotViews {
  const unitsById  = new Map<string, BattleUnitSnapshot>();
  const fieldUnits: FieldBattleUnitSnapshot[] = [];
  const benchUnits: (BattleUnitSnapshot | null)[] =
    Array.from({ length: state.benchSlotCount }, () => null);

  for (const unit of state.units.values()) {
    const dep  = requireDeployment(state, unit.id);
    const snap = buildBattleUnitSnapshot(unit, dep);
    unitsById.set(snap.id, snap);

    if (isFieldSnapshot(snap)) {
      // isFieldSnapshot narrows snap to FieldBattleUnitSnapshot — typed push, no cast.
      fieldUnits.push(snap);
      continue;
    }

    // Bench. dep mirrors snap.deployment; narrow dep to read .slot without a cast.
    if (dep.kind !== 'bench') continue; // unreachable; keeps TS narrowing honest
    const existing = benchUnits[dep.slot];
    if (existing) {
      throw new Error(
        `buildBattleUnitSnapshotViews: bench slot ${dep.slot} claimed by ` +
        `both "${existing.id}" and "${snap.id}"`,
      );
    }
    benchUnits[dep.slot] = snap;
  }

  return { unitsById, fieldUnits, benchUnits };
}

// --- Compatibility / test-convenience array views. ---
// NOT the production read-model API. Each call rebuilds a full view set and returns
// one slice; calling several of these in one flow yields snapshots from DIFFERENT
// view sets (separate object instances). Production code that needs a full battle
// phase read model must call buildBattleUnitSnapshotViews instead.

export function buildBattleUnitSnapshots(state: BattleState): BattleUnitSnapshot[] {
  return [...buildBattleUnitSnapshotViews(state).unitsById.values()];
}

export function buildFieldBattleUnitSnapshots(
  state: BattleState,
): FieldBattleUnitSnapshot[] {
  return buildBattleUnitSnapshotViews(state).fieldUnits;
}

export function buildBenchBattleUnitSnapshots(
  state: BattleState,
): (BattleUnitSnapshot | null)[] {
  return buildBattleUnitSnapshotViews(state).benchUnits;
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

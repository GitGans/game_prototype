import type { GamePhase } from './phases';
import type { CellCoord } from '../shared/gridTypes';
import type { BattleRuntimeContext } from './battleRuntimeContext';
import {
  buildBattleUnitSnapshotViews,
  buildBattleOccupancySnapshot,
  buildBattleFieldUnitCellsSnapshot,
  projectPreviewTarget,
} from './battleSnapshotBuilder';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import { hasChargedThisRound } from '../battle/turnResolver';
import { canBeginCombat } from '../battle/combatStart';
// The READ evaluator only. `battle/itemUse` — the executor — is deliberately absent from this
// module's import allowlist, so a projection has no path to a state replacement.
import {
  evaluateBattleItemUse,
  isSupportedBattleItemEffect,
} from '../battle/itemUsability';
import type { BattleActionBarEntry, FieldBattleUnitSnapshot } from '../shared/battleSnapshots';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

/**
 * The one battle-phase render/control projection: mutable BattleRuntimeContext →
 * scene-facing GamePhase snapshot.
 *
 * The caller owns runtime resolution and `sessionSource` validation
 * (`requireBattleRuntimeForPhase`) — this function receives an already-validated runtime.
 *
 * VALUE ISOLATION CONTRACT — no field of the result aliases runtime-owned mutable state.
 * `participants`, `roundQueue`, `validTargets` (and each coord), `placementSelection`, and
 * — via `buildBattleUnitSnapshotViews` — every unit's `shape`, `deployment`, `sprite.states`,
 * `skills` array and `activeEffects` (including nested `effect` / `periodicHp`) are copies.
 * The only references shared with another layer are the `ActionSkillDefinition` entries
 * inside `skills`: immutable static content from the SKILLS registry.
 */
/**
 * The active unit's action bar: its ordinary skills, then its equipped usable item.
 *
 * The item entry is appended only when the action genuinely EXISTS. Outside manual player
 * control there is no entry at all rather than a disabled one, because `not_manual_mode` is an
 * execution-time refusal, not a render state — and an unsupported effect (a revive scroll)
 * likewise produces nothing, because "disabled but recoverable" and "never usable" should not
 * look the same. `unit_full_hp` is the recoverable case, and it DOES render, disabled.
 *
 * Ordinary skill indexes are untouched: the item is never a catalog entry, never a learned
 * skill, and therefore never a candidate for AI skill selection.
 */
function buildActiveUnitActions(
  activeUnit: FieldBattleUnitSnapshot | null,
  runtime: BattleRuntimeContext,
): BattleActionBarEntry[] {
  if (!activeUnit) return [];

  const actions: BattleActionBarEntry[] = activeUnit.skills.map((skill, skillIndex) => ({
    kind: 'skill', skillIndex, skill,
  }));

  if (runtime.mode !== 'manual') return actions;
  if (activeUnit.side !== 'player') return actions;

  const resource = runtime.usableResources.get(activeUnit.id);
  if (!resource) return actions;
  if (!isSupportedBattleItemEffect(resource.effect)) return actions;

  const eligibility = evaluateBattleItemUse({
    state:           runtime.state,
    mode:            runtime.mode,
    unitId:          activeUnit.id,
    instanceId:      resource.instanceId,
    resource:        { instanceId: resource.instanceId, name: resource.name, effect: resource.effect },
    // A consumed item is already gone from `usableResources`, so reaching here means unconsumed.
    alreadyConsumed: false,
  });

  actions.push({
    kind:           'item',
    unitId:         activeUnit.id,
    instanceId:     resource.instanceId,
    label:          resource.name,
    sprite:         resource.sprite,
    // Copied: no snapshot field may share an object with the runtime.
    effect:         { ...resource.effect },
    enabled:        eligibility.ok,
    disabledReason: eligibility.ok ? null : eligibility.reason,
  });

  return actions;
}

export function buildBattlePhaseSnapshot(
  phase: BattlePhase,
  runtime: BattleRuntimeContext,
): BattlePhase {
  const battleState = runtime.state;

  const { unitsById, fieldUnits, benchUnits } = buildBattleUnitSnapshotViews(battleState);
  const occupancy      = buildBattleOccupancySnapshot(battleState);
  const fieldUnitCells = buildBattleFieldUnitCellsSnapshot(battleState);

  // roundQueue is field-only by invariant — look up via fieldUnits to preserve
  // FieldBattleUnitSnapshot typing for activeUnit. Never via unitsById.
  const fieldById    = new Map(fieldUnits.map(u => [u.id, u]));
  const activeUnitId = battleState.roundQueue[0] ?? null;
  const activeUnit   = activeUnitId ? (fieldById.get(activeUnitId) ?? null) : null;

  const battleMode     = runtime.mode;
  const activeUnitSide = activeUnit?.side ?? null;

  const manualTurnControlsVisible = battleMode === 'manual' && activeUnitSide === 'player';

  const manualChargeDisabled =
    activeUnitId !== null && hasChargedThisRound(runtime.turnContext, activeUnitId);

  const targetHighlightKind = resolveTargetHighlightKind(activeUnit, battleState.validTargets);

  const { previewTargetCoord, previewTargetUnitId } = projectPreviewTarget({
    battlePhase:         battleState.phase,
    previewTargetCoord:  battleState.previewTargetCoord,
    validTargets:        battleState.validTargets,
    hasActiveUnit:       activeUnit !== null,
    fieldUnitCells,
    unitsById,
    targetHighlightKind,
  });

  // participants = battle-start snapshot; do NOT rebuild from current placement state.
  return {
    ...phase,
    participants:        runtime.participants.map(p => ({ ...p })),
    benchUnits,
    placementSelection:  { ...battleState.placementSelection },
    battlePhase:         battleState.phase,
    canBeginCombat:      canBeginCombat(battleState),
    fieldUnits,
    unitsById,
    occupancy,
    fieldUnitCells,
    roundQueue:          [...battleState.roundQueue],
    activeUnitId,
    activeUnit,
    activeUnitActions: buildActiveUnitActions(activeUnit, runtime),
    battleMode,
    activeUnitSide,
    manualTurnControlsVisible,
    manualChargeDisabled,
    validTargets:        battleState.validTargets.map(c => ({ ...c })),
    targetHighlightKind,
    previewTargetCoord,
    previewTargetUnitId,
  };
}

function resolveTargetHighlightKind(
  activeUnit: BattlePhase['activeUnit'],
  // Read-only: this receives the runtime-owned `BattleState.validTargets`, not the
  // snapshot's copied array. Inspected only, never stored.
  validTargets: readonly CellCoord[],
): BattlePhase['targetHighlightKind'] {
  if (!activeUnit || validTargets.length === 0) return 'none';

  const policy = compileSkillUsePlan(getActiveSkill(activeUnit)).targetPolicy;
  switch (policy.type) {
    case 'enemy_melee':
    case 'enemy_ranged':
      return 'target';
    case 'alive_friendly':
    case 'self':
      return 'heal_target';
    case 'dead_friendly':
      return 'revive_target';
    default: {
      // Compile-time exhaustiveness: a new target policy must make an explicit
      // highlight decision here, not silently fall through to 'none'.
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

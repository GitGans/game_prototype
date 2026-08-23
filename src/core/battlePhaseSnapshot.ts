import type { GamePhase } from './phases';
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
  validTargets: BattlePhase['validTargets'],
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

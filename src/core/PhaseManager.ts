import { GamePhase, PhaseAction } from './phases';
import type { PhaseSceneSynchronizer } from './phaseSceneSynchronizer';
import { resolveTransition } from './phaseTransitionResolver';
import type { PhaseTransitionMetadata } from './phaseTransitionMetadataContract';
import { derivePhaseTransitionMetadata } from './phaseTransitionMetadata';
import { rebuildPhaseSnapshot } from './phaseSnapshotRebuilder';
import { notifyPhaseChanged } from './phaseChangeNotifier';
import { createDefaultPhaseActionEffects } from './phaseActionEffects';
import type { PhaseEffectsResult } from './phaseEffectsResult';
import type { PhaseTransitionResult } from './phaseTransitionResult';

/**
 * The collaborator set the coordinator sequences.
 *
 * Every field is REQUIRED and there are no defaults inside `PhaseManagerClass`: a manager can
 * only exist if someone composed it explicitly, so a test can never silently fall through to a
 * real owner that mutates the `GameState` singleton.
 *
 * `PhaseSceneSynchronizer` is deliberately NOT here — it is injected later, through `init()`,
 * because scene control only becomes available once Phaser has booted.
 */
export interface PhaseManagerDependencies {
  deriveMetadata(currentPhase: GamePhase, action: PhaseAction): PhaseTransitionMetadata;
  resolveTransition(
    currentPhase: GamePhase,
    action: PhaseAction,
    metadata: PhaseTransitionMetadata,
  ): GamePhase | null;
  applyEffects(
    action: PhaseAction,
    previousPhase: GamePhase,
    resolvedPhase: GamePhase,
  ): PhaseEffectsResult;
  rebuildSnapshot(phase: GamePhase): GamePhase;
  notifyPhaseChanged(): void;
}

/**
 * The transition-pipeline coordinator. It sequences injected collaborators and implements none
 * of their rules: routing lives in `phaseTransitionResolver`, the resolver's stateful inputs in
 * `phaseTransitionMetadata`, all mutation and lifecycle work in `phaseActionEffects`, snapshot
 * rebuilding in `phaseSnapshotRebuilder`, scene control behind `PhaseSceneSynchronizer`, and
 * the mutation-only refresh in `phaseChangeNotifier`.
 *
 * Consequently this file inspects no action or phase discriminator, touches no domain state,
 * and holds no RNG.
 *
 * Its public surface is exactly `init`, `getPhase` and `transition` — enforced by the AST scan
 * in `scripts/phase-manager-policy.mjs` against `PHASE_MANAGER_PUBLIC_API`.
 */
export class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private sceneSynchronizer: PhaseSceneSynchronizer | null = null;

  constructor(private readonly dependencies: PhaseManagerDependencies) {}

  init(sceneSynchronizer: PhaseSceneSynchronizer): void {
    this.sceneSynchronizer = sceneSynchronizer;
  }

  private requireSceneSynchronizer(): PhaseSceneSynchronizer {
    if (!this.sceneSynchronizer) {
      throw new Error(
        'PhaseManager.transition() called before PhaseManager.init() — no PhaseSceneSynchronizer registered.',
      );
    }
    return this.sceneSynchronizer;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  transition(action: PhaseAction): PhaseTransitionResult {
    const { deriveMetadata, resolveTransition, applyEffects, rebuildSnapshot, notifyPhaseChanged } =
      this.dependencies;

    const previousPhase = this.phase;

    const metadata = deriveMetadata(previousPhase, action);

    const resolvedPhase = resolveTransition(previousPhase, action, metadata);
    if (resolvedPhase === null) {
      return { status: 'rejected' }; // invalid action for current phase
    }

    // Reference identity, captured BEFORE any rebuild. Two traps this guards against:
    //  - rebuildSnapshot() returns a NEW object for mutation-only battle actions, so
    //    classifying after the rebuild would misreport every in-battle mutation;
    //  - `replay` resolves to `{ ...currentPhase }` — a COPY — so it is a navigation
    //    even though its phase type stays 'battle'. Never compare phase discriminators here.
    const isMutation = resolvedPhase === previousPhase;

    // Navigation precondition: fail before any side effect runs, so a missing
    // init() call never leaves GameState mutated while `this.phase` is stale.
    const sceneSynchronizer = isMutation ? null : this.requireSceneSynchronizer();

    // Every mutation, lifecycle sequence and battle-runtime disposal — including the generic
    // battle-to-non-battle teardown — happens inside this one call.
    const effects = applyEffects(action, previousPhase, resolvedPhase);

    // One rebuild input for both branches: on a mutation `resolvedPhase` IS `previousPhase`.
    // Commit only after the rebuild succeeds — a throwing rebuild leaves the phase untouched.
    const rebuiltPhase = rebuildSnapshot(resolvedPhase);
    this.phase = rebuiltPhase;

    if (sceneSynchronizer === null) {
      notifyPhaseChanged();
    } else {
      sceneSynchronizer.sync(rebuiltPhase);
    }

    return { status: 'applied', battleFeedback: effects.battleFeedback };
  }
}

/**
 * The ONLY production composition path.
 *
 * `createDefaultPhaseActionEffects()` is called INSIDE this function, never at module scope:
 * the controller owns a gameplay RNG stream pair, and two managers sharing one would let a
 * lifecycle reset in either silently reseed the other. Calling it here also keeps the binding
 * resolution late enough for the RNG characterization suite's `vi.doMock()` seam.
 *
 * The factory lives in this file rather than a separate composition module purely for scope:
 * every scene imports `PhaseManager` from `core/PhaseManager`, so a split would require a
 * re-export here anyway. Migrating scene imports to a dedicated composition module is a
 * defensible future change — it is simply not needed yet.
 */
export function createProductionPhaseManager(): PhaseManagerClass {
  const actionEffects = createDefaultPhaseActionEffects();

  return new PhaseManagerClass({
    deriveMetadata: derivePhaseTransitionMetadata,
    resolveTransition,
    applyEffects: actionEffects.apply,
    rebuildSnapshot: rebuildPhaseSnapshot,
    notifyPhaseChanged,
  });
}

export const PhaseManager = createProductionPhaseManager();

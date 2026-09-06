/**
 * The neutral data contract between metadata derivation, the pure resolver and the coordinator.
 *
 * It lives in its own module — not in `phaseTransitionResolver.ts` and not in
 * `phaseTransitionMetadata.ts` — because boundaries are enforced per module. Declaring it in the
 * resolver would force `phaseTransitionMetadata` to import the router, and a module-level import
 * allowlist cannot distinguish "may name the type" from "may call `resolveTransition`": the
 * metadata facade would silently gain routing authority. Declaring it in the derivation module
 * would force the pure resolver to import a module that reads `GameState`, breaking its purity
 * rather than merely a checker rule. A third module with no imports of its own satisfies both.
 *
 * There is deliberately no re-export from `phaseTransitionResolver.ts`: it would restore the exact
 * bypass this split removes.
 *
 * Types only. Its import allowlist is empty (`TRANSITION_CONTRACT_IMPORT_POLICIES`) and pinned by
 * `tests/scripts/boundaryPolicy.test.ts`.
 */
export interface PhaseTransitionMetadata {
  mapCleared: boolean;
}

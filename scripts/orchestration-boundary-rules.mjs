// Pure-data orchestration boundary policies shared by scripts/check-boundaries.mjs
// and its tests. No fs, no process access — scripts/boundary-policy.mjs evaluates
// these against normalized import specifiers.

// PhaseManager is only the transition-pipeline coordinator. Any new dependency
// must be an explicit orchestration dependency approved here.
export const PHASE_MANAGER_IMPORT_POLICY = {
  kind: "exact-import-allowlist",
  allowedSpecifiers: [
    "core/phases",
    "core/phaseTransitionResolver",
    "core/phaseTransitionMetadata",
    "core/phaseActionEffects",
    "core/phaseSnapshotRebuilder",
    "core/phaseSceneSynchronizer",
    "core/phaseChangeNotifier",
    "core/phaseTransitionResult",
    "core/phaseEffectsResult",
  ],
};

// Every current phase handler's exact, reviewed dependency set, keyed by full
// source-relative path (including extension) so a handler in a subdirectory or
// a .tsx handler is still addressed unambiguously — never reconstructed by
// appending ".ts" to a bare name. Adding a new dependency to a handler requires
// an explicit review of this allowlist — there is no shared/broad `core/**` or
// cross-domain fallback.
export const PHASE_HANDLER_IMPORT_POLICIES = {
  "core/phaseHandlers/battlePhaseHandler.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "battle/types",
      "core/phases",
      "shared/random",
      "battle/initiative",
      "battle/battleEvents",
      "shared/gridTypes",
      "battle/turnResolver",
      "battle/combat",
      "battle/battleTransition",
      "battle/skillTurnResolver",
      "battle/autoTurn",
      "battle/placementState",
      "battle/deployment",
      "battle/lifeState",
      "battle/combatStart",
      "core/playerSessionState",
      "core/playerSessionStore",
      "core/playerUnitPersistence",
      "core/battleExit",
      "core/battleRuntimeContext",
      "core/battleActionFeedback",
    ],
  },
  "core/phaseHandlers/campPhaseHandler.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/playerSessionStore",
      "core/playerSessionState",
      "core/phases",
      "progression",
    ],
  },
  "core/phaseHandlers/inventoryPhaseHandler.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/playerSessionStore",
      "core/playerSessionState",
      "core/phases",
      "data/units",
      "data/itemDefinitions",
      "progression",
      "inventory",
    ],
  },
  "core/phaseHandlers/progressionPhaseHandler.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/playerSessionStore",
      "core/playerSessionState",
      "core/phases",
      "data/units",
      "progression",
    ],
  },
};

// Empty until a handler needs a documented exception. Each entry is
// { handler: "core/phaseHandlers/<...>.ts", reason: "..." } — a handler must
// have exactly one of a policy or an exclusion, never both, never neither,
// never a duplicate exclusion. See scripts/phase-handler-coverage.mjs.
export const PHASE_HANDLER_COVERAGE_EXCLUSIONS = [];

// Prefixes scenes (including scenes/controllers/**) must never import, on top
// of the pre-existing scenes/** restrictions. Scenes dispatch through
// PhaseManager and read only GamePhase; they must not see the modules that own
// state, lifecycle, routing, notification, or pipeline internals directly —
// not even a type-only import. `phaseTransitionResolver` and
// `phaseChangeNotifier` are included alongside the mutation/state modules:
// a scene that reaches either could make routing decisions or emit phase
// change notifications itself, bypassing `PhaseManager.transition()` entirely.
//
// The read side follows one rule, stated by authority rather than by name:
// scenes never import runtime access, or modules that build the committed
// GamePhase snapshot from authoritative state — including internal snapshot
// helpers like unitStatsSnapshot, since banning only the composing module
// leaves the same bypass one level down. worldMapProjection is listed for a
// stronger reason still: it also exports applyMovePartyToCampaign, a campaign
// state mutation.
//
// This is deliberately NOT "no projection modules". `battleDirectiveProjection`
// and `battleSkillPreviewProjection` are scene-facing presentation adapters:
// they derive transient presentation models from committed GamePhase data or
// call-scoped transition feedback, resolve no authoritative state, and build no
// part of the committed snapshot. Scenes import them today, by design. Do not
// add them here.
export const SCENE_PIPELINE_BANNED_IMPORTS = [
  // state stores and lifecycle owners
  "core/GameState",
  "core/DebugBattleState",
  "core/playerSessionStore",
  "core/debugLifecycle",
  // mutation handlers and pipeline internals
  "core/phaseHandlers",
  "core/phaseActionEffects",
  "core/phaseTransitionMetadata",
  "core/phaseSnapshotRebuilder",
  "core/phaseTransitionResolver",
  "core/phaseChangeNotifier",
  "core/phaseEffectsResult",
  // battle runtime and its access seam
  "core/battleRuntimeContext",
  "core/battleRuntimeAccess",
  // builders of the committed GamePhase snapshot, and their internal helpers
  "core/battlePhaseSnapshot",
  "core/battleSnapshotBuilder",
  "core/battleResultsSnapshot",
  "core/equipmentScreenSnapshot",
  "core/unitStatsSnapshot",
  "core/rosterCampSnapshot",
  "core/upgradeTreeSnapshot",
  "core/worldMapProjection",
];

// The complete, real scenes/** policy — the single object both the checker and
// its tests consume, so spreading SCENE_PIPELINE_BANNED_IMPORTS into the real
// rule can never silently drift from what the tests assert against. Includes
// the two restrictions that predate this stage (battle/skillPreview, save).
export const SCENES_IMPORT_POLICY = {
  kind: "blocklist",
  banned: ["battle/skillPreview", "save", ...SCENE_PIPELINE_BANNED_IMPORTS],
};

// Public/internal transition contracts. Deliberately tiny, fail-closed allowlists:
// these are the modules scenes are *encouraged* to import, so a stateful dependency
// added here would silently re-open every boundary this stage closes. Adding any
// specifier requires an explicit review — and tests/scripts/boundaryPolicy.test.ts
// pins this object exactly, so weakening a contract boundary cannot pass unnoticed.
//
// Note battleActionFeedback does NOT list battle/turnResolver: it declares its own
// narrowed BattleTurnDirectiveFeedback precisely so no internal directive type
// (with its BattleState-aliasing `validTargets`) can leak in by widening.
export const TRANSITION_CONTRACT_IMPORT_POLICIES = {
  "core/battleActionFeedback.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["shared/gridTypes", "battle/battleEvents"],
  },
  "core/phaseTransitionResult.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["core/battleActionFeedback"],
  },
  "core/phaseEffectsResult.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["core/battleActionFeedback"],
  },
};

// Exact Phaser scene-control permissions, consumed by scripts/scene-control-policy.mjs.
// Two policy shapes:
//   - `calls: [{ method, target }]` — an exact, closed list of permitted calls;
//     each entry's argument must be a string literal equal to `target`, and each
//     entry may occur at most once in the file. This is the bootstrap shape: the
//     architectural exception is for two specific edges, not general scene
//     control ownership inside Boot.ts/Preloader.ts.
//   - `methods: [...]` — the file may call any of these methods with exactly one
//     argument, and the argument's value may be dynamic (phaserSceneSynchronizer.ts
//     resolves its target from a compile-time-exhaustive phase→scene-key map, so
//     the key is not a source-level literal).
// Every file with no entry here may call none of the scanned control methods.
export const SCENE_CONTROL_POLICY = {
  "scenes/Boot.ts": { calls: [{ method: "start", target: "Preloader" }] },
  "scenes/Preloader.ts": { calls: [{ method: "start", target: "MainMenu" }] },
  "scenes/phaserSceneSynchronizer.ts": { methods: ["start", "stop"] },
};

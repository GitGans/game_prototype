// Pure-data orchestration boundary policies — plus one pure compilation — shared by
// scripts/check-boundaries.mjs and its tests. No fs, no process access:
// scripts/boundary-policy.mjs evaluates these against normalized import specifiers, and
// scripts/orchestration-collaborator-policy.mjs compiles the collaborator registry at the
// bottom of this file into the same policy shape.

import { compileCollaboratorRegistry } from "./orchestration-collaborator-policy.mjs";
import { compileModuleExportPolicies } from "./module-export-policy.mjs";

// The pure router may see phase contracts and the neutral metadata contract — nothing else.
// Its purity is load-bearing rather than merely a checker rule (Node-importable with zero
// browser globals, no state, no RNG), so unlike the other pipeline allowlists this one is
// pinned by tests/scripts/boundaryPolicy.test.ts instead of living as a local literal inside
// the executable checker.
//
// core/phaseTransitionMetadataContract is the type-only module PhaseTransitionMetadata moved
// to in Stage 4A. The type could not stay declared here: phaseTransitionMetadata.ts would then
// have to import this module, and a module-level allowlist cannot distinguish "may name the
// type" from "may call resolveTransition".
export const PHASE_TRANSITION_RESOLVER_IMPORT_POLICY = {
  kind: "exact-import-allowlist",
  allowedSpecifiers: ["core/phases", "core/phaseTransitionMetadataContract"],
};

// PhaseManager is only the transition-pipeline coordinator. Any new dependency
// must be an explicit orchestration dependency approved here.
export const PHASE_MANAGER_IMPORT_POLICY = {
  kind: "exact-import-allowlist",
  allowedSpecifiers: [
    "core/phases",
    "core/phaseTransitionResolver",
    "core/phaseTransitionMetadata",
    "core/phaseTransitionMetadataContract",
    "core/phaseActionEffects",
    "core/phaseSnapshotRebuilder",
    "core/phaseSceneSynchronizer",
    "core/phaseChangeNotifier",
    "core/phaseTransitionResult",
    "core/phaseEffectsResult",
  ],
};

// PhaseManager's entire public surface. `init` is the scene-synchronizer injection seam,
// `getPhase` the single render-data source, and `transition` the single entry point for every
// state change. Anything else — a stored PhaseEffectsResult, a classification getter, an RNG
// reset, a debug accessor, an index signature — is a re-opened boundary, so this list is pinned
// exactly by tests/scripts/boundaryPolicy.test.ts. The constructor is allowed independently: it
// is required for dependency injection and is not itself a member.
export const PHASE_MANAGER_PUBLIC_API = ["init", "getPhase", "transition"];

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
  "core/phaseHandlers/worldPhaseHandler.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/GameState",
      "core/phases",
      "core/battleRuntimeContext",
      "core/battleRuntimeAccess",
      "core/campaignWorldTransitions",
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
// leaves the same bypass one level down. worldMapProjection is banned under
// exactly that rule: it builds the committed world_map snapshot.
//
// The write side is banned by the same authority argument: campaignLifecycle,
// campaignWorldTransitions and battlePhaseEffects own campaign creation,
// campaign-world transformations and battle runtime installation/disposal.
// campaignWorldTransitions is pure and touches no store, but a scene holding
// `(CampaignState, ...) => CampaignState` has half of a state mutation and needs
// only GameState — already banned — to complete it; there is no rendering reason
// for a scene to import a campaign transformation at all.
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
  "core/campaignLifecycle",
  // mutation handlers and pipeline internals
  "core/phaseHandlers",
  "core/battlePhaseEffects",
  "core/campaignWorldTransitions",
  "core/phaseActionEffects",
  "core/phaseTransitionMetadata",
  "core/phaseSnapshotRebuilder",
  "core/phaseTransitionResolver",
  // Banned for symmetry with phaseEffectsResult: an internal pipeline contract with no
  // scene-facing purpose. NOT because naming the type would grant a scene routing authority
  // — it would not; resolveTransition is what is banned, and it stays banned just above.
  "core/phaseTransitionMetadataContract",
  "core/phaseChangeNotifier",
  "core/phaseEffectsResult",
  // battle runtime, its storage cell and both access gateways
  "core/battleRuntimeContext",
  "core/battleRuntimeAccess",
  "core/battleRuntimeStorage",
  "core/battleRuntimeWriteAccess",
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
  // The neutral contract between metadata derivation, the resolver and the coordinator.
  // Its allowlist is EMPTY and must stay empty: the whole point of the module is that both a
  // GameState-reading deriver and a pure router can depend on it without depending on each
  // other. One import here would make it a shared dependency of both and re-open that edge.
  "core/phaseTransitionMetadataContract.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [],
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

// ─── Orchestration facade collaborator registry (Stage 4A) ──────────────────
//
// The three orchestration facades beneath PhaseManager and their complete, classified
// dependency sets. PhaseManager itself has been closed since Stage 3; these three had only
// the broad core/** blocklist, so any of them could acquire GameState, a data catalogue or a
// lifecycle owner without one reviewable line changing in scripts/.
//
// Each entry classifies an EDGE, not a module: core/GameState is a legitimate
// `authoritative-state-reader` for the snapshot and metadata facades and is forbidden outright
// for the effects facade. A global per-module label could not express that.
//
// Registered set and actual imports must match EXACTLY, in BOTH directions — see
// compareFacadeImports(). A subset-only allowlist would let a removed dependency leave a
// dormant permission behind, which is how a facade regrows authority without review.
//
// Collaborators are grouped by role, groups in FACADE_KIND_ROLES order, sorted within a group,
// so a reviewer can see at a glance whether a facade just gained another state reader.
export const ORCHESTRATION_COLLABORATOR_REGISTRY = {
  // The write side's dispatcher. It sequences owners and touches no store, no catalogue and
  // neither half of the read side — which is exactly what the `effects` role set encodes:
  // authoritative-state-reader, metadata-* and snapshot-projection are unavailable to it, so
  // acquiring one is a facade-kind change, not an added line.
  "core/phaseActionEffects.ts": {
    kind: "effects",
    collaborators: [
      { specifier: "core/phaseEffectsResult", role: "neutral-contract" },
      { specifier: "core/phases", role: "neutral-contract" },
      { specifier: "core/battlePhaseEffects", role: "effects-owner" },
      { specifier: "core/campaignLifecycle", role: "effects-owner" },
      { specifier: "core/debugLifecycle", role: "effects-owner" },
      { specifier: "core/phaseHandlers/campPhaseHandler", role: "effects-owner" },
      { specifier: "core/phaseHandlers/inventoryPhaseHandler", role: "effects-owner" },
      { specifier: "core/phaseHandlers/progressionPhaseHandler", role: "effects-owner" },
      { specifier: "core/phaseHandlers/worldPhaseHandler", role: "effects-owner" },
      // The per-manager gameplay RNG pair the facade owns in a factory closure.
      { specifier: "core/random", role: "effects-infrastructure" },
    ],
  },

  // Derives the stateful facts the pure resolver must not read itself. It reads campaign state
  // and static map data; it may never register an effects owner or a snapshot projection.
  // core/phaseTransitionResolver is deliberately absent: the shared type moved to
  // phaseTransitionMetadataContract precisely so this facade cannot reach the router.
  "core/phaseTransitionMetadata.ts": {
    kind: "metadata",
    collaborators: [
      { specifier: "core/phaseTransitionMetadataContract", role: "neutral-contract" },
      { specifier: "core/phases", role: "neutral-contract" },
      { specifier: "core/GameState", role: "authoritative-state-reader" },
      { specifier: "data/mapDefinitions", role: "metadata-source" },
      { specifier: "world/mapCompletion", role: "metadata-rule" },
    ],
  },

  // Dispatches authoritative state to render snapshots. Reads state, delegates every formula
  // to a projection module, mutates nothing — no lifecycle owner and no effects facade.
  "core/phaseSnapshotRebuilder.ts": {
    kind: "snapshot",
    collaborators: [
      { specifier: "core/phases", role: "neutral-contract" },
      { specifier: "core/GameState", role: "authoritative-state-reader" },
      { specifier: "core/battleRuntimeAccess", role: "authoritative-state-reader" },
      { specifier: "core/playerSessionStore", role: "authoritative-state-reader" },
      { specifier: "core/battlePhaseSnapshot", role: "snapshot-projection" },
      { specifier: "core/battleResultsSnapshot", role: "snapshot-projection" },
      { specifier: "core/equipmentScreenSnapshot", role: "snapshot-projection" },
      { specifier: "core/rosterCampSnapshot", role: "snapshot-projection" },
      { specifier: "core/upgradeTreeSnapshot", role: "snapshot-projection" },
      { specifier: "core/worldMapProjection", role: "snapshot-projection" },
    ],
  },
};

// Compiled, never hand-maintained. Both check-boundaries.mjs and boundaryPolicy.test.ts consume
// this one result, so the registry and the enforced allowlists cannot describe different
// architectures. `.policies` is empty whenever `.problems` is non-empty: a broken registry
// yields no enforceable policy rather than a partial one, and fails the build through the
// checker's own diagnostics instead of throwing during module initialization.
export const ORCHESTRATION_REGISTRY_COMPILATION = compileCollaboratorRegistry(
  ORCHESTRATION_COLLABORATOR_REGISTRY,
);

// ─── Stage 4B: battle-runtime read/write ownership ──────────────────────────

/**
 * Outbound ownership policies for the battle-runtime triad and GameState.
 *
 * GameState is pinned so battle runtime — or any other domain runtime — cannot return to it:
 * the four allowed specifiers are exactly the campaign/debug container types it holds.
 * The triad is pinned so storage stays rule-free and each gateway keeps its single
 * responsibility — the write gateway, in particular, may not acquire a read.
 */
export const RUNTIME_OWNERSHIP_IMPORT_POLICIES = {
  "core/GameState.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "campaign",
      "core/DebugBattleState",
      "inventory",
      "progression",
    ],
  },
  "core/battleRuntimeStorage.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["core/battleRuntimeContext"],
  },
  "core/battleRuntimeAccess.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/battleRuntimeContext",
      "core/battleRuntimeStorage",
      "core/phases",
    ],
  },
  "core/battleRuntimeWriteAccess.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/battleRuntimeContext",
      "core/battleRuntimeStorage",
    ],
  },
};

/**
 * The complete private-state surface of GameStateManager. An allowlist, not a blocklist:
 * re-adding `battleRuntime` — or any new domain runtime — must be a visible policy change,
 * not a silent field declaration.
 */
export const GAME_STATE_FIELDS = ["campaignState", "debugState"];

/**
 * The complete PUBLIC surface of GameStateManager: campaign and debug container access only.
 *
 * The field list stops a new stored field; this stops a new exposed CAPABILITY — including one
 * backed by module-local storage that no field registry could see. Together they make
 * "GameState owns campaign and debug containers only" mechanically enforceable rather than a
 * convention held up by review.
 */
export const GAME_STATE_PUBLIC_API = [
  "clearDebugState",
  "getCampaignState",
  "getDebugState",
  "hasCampaignState",
  "replaceCampaignInventory",
  "replaceCampaignRoster",
  "replaceDebugInventory",
  "replaceDebugRoster",
  "requireDebugState",
  "setCampaignState",
  "setDebugState",
];

/**
 * Inbound (importer-direction) restrictions: WHO may import a module, as opposed to what a
 * module may import. Capability modules need this direction — an outbound allowlist on
 * battleRuntimeWriteAccess constrains what it depends on, not who may pick up the authority
 * to replace a battle attempt.
 *
 * KEY CONVENTION — the two halves are deliberately asymmetric, and both are validated:
 *   keys             = normalized, EXTENSIONLESS specifiers (what normalizeSpecifier yields)
 *   allowedImporters = src-relative paths WITH .ts/.tsx  (what the file walk yields)
 * Each is correct for the value it is compared against. Adding ".ts" to a key to "fix the
 * inconsistency" would make it match nothing — a restricted target that silently stops being
 * restricted, i.e. a fail-OPEN hole. validateRestrictedImportTargets rejects both mistakes.
 *
 * `allowedImporters` must be sorted and duplicate-free so registry diffs stay reviewable.
 */
export const RESTRICTED_IMPORT_TARGETS = {
  "core/battleRuntimeStorage": {
    reason: "Internal battle-runtime storage cell.",
    allowedImporters: [
      "core/battleRuntimeAccess.ts",
      "core/battleRuntimeWriteAccess.ts",
    ],
  },
  "core/battleRuntimeWriteAccess": {
    reason: "Battle-runtime write capability owned by battlePhaseEffects.",
    allowedImporters: ["core/battlePhaseEffects.ts"],
  },
};

/**
 * The exact public export surface of every module holding restricted battle-runtime authority.
 *
 * RESTRICTED_IMPORT_TARGETS above says who may PICK the authority up; this says what the
 * permitted holders may HAND ON. Without it, an allowed importer can re-export a restricted
 * capability under any name — including an approved one — and every other module reaches it
 * through an unrestricted specifier while the import checker stays green. battleRuntimeAccess
 * is the sharp case: it may legitimately import storage, so nothing but this closes that path.
 *
 * Entries are the REVIEWED expected surface, written by hand. They are deliberately not derived
 * from the source (that would agree with any change) nor from imports (an export surface is a
 * different decision from a dependency list).
 *
 * Shape: an ARRAY of { name, kind }, not a { name: kind } map — an object literal silently
 * deduplicates a repeated key, which would make the duplicate-registration check unreachable.
 * Sorted by name, so a diff shows exactly one added or removed line.
 * Kinds: "function" | "type-alias" — see scripts/module-export-policy.mjs.
 */
export const RUNTIME_OWNERSHIP_EXPORT_POLICIES = {
  "core/battleRuntimeStorage.ts": [
    { name: "clearBattleRuntimeSlot", kind: "function" },
    { name: "readBattleRuntimeSlot", kind: "function" },
    { name: "writeBattleRuntimeSlot", kind: "function" },
  ],
  "core/battleRuntimeAccess.ts": [
    { name: "requireBattleRuntimeForPhase", kind: "function" },
  ],
  "core/battleRuntimeWriteAccess.ts": [
    { name: "clearBattleRuntime", kind: "function" },
    { name: "installBattleRuntime", kind: "function" },
  ],
  "core/battlePhaseEffects.ts": [
    { name: "BattleRuntimeMutationAction", kind: "type-alias" },
    { name: "applyBattleExitRosterEffect", kind: "function" },
    { name: "applyBattleRuntimeMutation", kind: "function" },
    { name: "clearBattleRuntimeIfPresent", kind: "function" },
    { name: "replayBattleRuntime", kind: "function" },
    { name: "startBattleRuntime", kind: "function" },
    { name: "teardownBattleRuntimeAfterTransition", kind: "function" },
  ],
};

/**
 * Which modules MUST have a pinned export surface: every restricted target, plus every module
 * permitted to import one. That is precisely the set holding restricted authority, so the
 * closure argument is derived rather than asserted by four hand-written keys — adding a
 * restricted target or a permitted importer automatically requires a reviewed export surface.
 * The same obligation checkPhaseHandlerCoverage imposes on core/phaseHandlers/**.
 *
 * Only the coverage obligation is derived; the export NAMES stay hand-reviewed above.
 */
export const RUNTIME_OWNERSHIP_EXPORT_COVERAGE = [
  ...new Set([
    ...Object.keys(RESTRICTED_IMPORT_TARGETS).map((target) => `${target}.ts`),
    ...Object.values(RESTRICTED_IMPORT_TARGETS).flatMap((entry) => entry.allowedImporters),
  ]),
].sort();

export const RUNTIME_OWNERSHIP_EXPORT_COMPILATION = compileModuleExportPolicies(
  RUNTIME_OWNERSHIP_EXPORT_POLICIES,
  RUNTIME_OWNERSHIP_EXPORT_COVERAGE,
);

// ─── Stage 4C: facade collaborator import policies ──────────────────────────
//
// The exact, reviewed dependency set of every direct non-neutral facade collaborator that does
// not already receive an exact policy from a canonical registry of its own. Phase handlers get
// theirs from PHASE_HANDLER_IMPORT_POLICIES; core/GameState and core/battleRuntimeAccess from
// RUNTIME_OWNERSHIP_IMPORT_POLICIES. Everything else registered beneath the three facades is
// here.
//
// Stage 4A guarantees a facade's imports match its registration; it says nothing about what
// those registered collaborators may import. That gap is the hidden-monolith route this
// registry closes: battlePhaseEffects acquiring snapshot construction, campaignLifecycle
// absorbing debug lifecycle, worldMapProjection importing GameState and becoming a mutation
// route.
//
// The OBLIGATION to appear here is derived from ORCHESTRATION_COLLABORATOR_REGISTRY (see
// scripts/orchestration-collaborator-coverage.mjs), so a new collaborator cannot exist
// ungoverned and an entry with no corresponding collaborator is a stale registration. The
// CONTENTS stay hand-reviewed: deriving an allowlist from source would agree with any change.
//
// These supplement, never replace, the broader PURE_CORE_FILES purity rules and the
// directory-layer RULES; a module can be subject to all three.
//
// Written sorted lexicographically within each list, as a readability convention for this
// registry only, so a diff shows exactly one added or removed line. Order is deliberately NOT
// machine-validated — see the note in scripts/orchestration-collaborator-coverage.mjs.
export const ORCHESTRATION_COLLABORATOR_IMPORT_POLICIES = {
  // ── Effects side ──

  // The battle-runtime lifecycle owner. It may hold battle rules, both runtime gateways,
  // session storage (it reads AND writes rosters), the pipeline contracts and the RNG type.
  // It may hold no snapshot builder and no metadata module: producing render state belongs to
  // the read side, and a write owner that could also project is the hidden monolith this
  // registry exists to prevent. Stage 4B's write-capability design is unchanged by this entry.
  "core/battlePhaseEffects.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "battle/turnResolver",
      "core/battleRuntimeAccess",
      "core/battleRuntimeContext",
      "core/battleRuntimeWriteAccess",
      "core/battleStart",
      "core/phaseEffectsResult",
      "core/phaseHandlers/battlePhaseHandler",
      "core/phases",
      "core/playerSessionStore",
      "shared/random",
    ],
  },

  // Campaign CONTAINER creation. Its five data catalogues are exactly why it exists — they
  // stay out of phaseActionEffects, which decides *when* a campaign is created but must not
  // know what one is made of. No debug lifecycle, no battle runtime, no RNG.
  "core/campaignLifecycle.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/GameState",
      "core/initCampaignState",
      "data/campaignInitialStateDefinition",
      "data/itemDefinitions",
      "data/mapDefinitions",
      "data/startingInventoryDefinitions",
      "data/units",
    ],
  },

  // Debug session CONTAINER lifecycle. The mirror of campaignLifecycle; the two must stay
  // separable, so this must not acquire campaign construction — no core/initCampaignState and
  // no data/campaignInitialStateDefinition.
  "core/debugLifecycle.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/DebugBattleState",
      "core/GameState",
      "core/debugPlayerSession",
      "data/itemDefinitions",
      "data/startingInventoryDefinitions",
      "data/units",
    ],
  },

  // The RNG implementations. The only file permitted to call Math.random() (see the
  // [no-ambient-random] scan), and therefore deliberately dependency-free beyond the contract.
  "core/random.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["shared/random"],
  },

  // ── Metadata side ──
  // core/GameState.ts is NOT duplicated here: its canonical policy stays in
  // RUNTIME_OWNERSHIP_IMPORT_POLICIES, and two policies for one module would make neither
  // authoritative.

  // Static content catalogue: shared type contracts only.
  "data/mapDefinitions.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["shared/worldTypes"],
  },

  // The pure map-completion rule: its own domain types only. No storage, no core, no phases —
  // this is what keeps `{ mapCleared }` derivable without the resolver reading state.
  "world/mapCompletion.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["world/types"],
  },

  // ── Snapshot side ──
  // core/battleRuntimeAccess.ts is NOT duplicated here — same reason as core/GameState.ts.

  // The sole seam resolving a PlayerSessionSource to campaign or debug storage. Storage-only:
  // it may see the two player-owned domain contracts and the state singleton, and no
  // inventory/progression/battle RULE — those live in their own domains.
  "core/playerSessionStore.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/GameState",
      "core/playerSessionState",
      "inventory",
      "progression",
    ],
  },

  // The battle render/control projection. Battle formulas are correct here — core deriving
  // presentation data from authoritative state — but a store, a runtime gateway or a write
  // owner is not: the caller hands it an already-validated runtime.
  "core/battlePhaseSnapshot.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "battle/combatStart",
      "battle/skillPlanCompiler",
      "battle/skillRuntime",
      "battle/turnResolver",
      "core/battleRuntimeContext",
      "core/battleSnapshotBuilder",
      "core/phases",
      "shared/gridTypes",
    ],
  },

  // The result-screen read model: a pure function of (roster, seeds), type contracts only.
  "core/battleResultsSnapshot.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["core/phases", "progression"],
  },

  // The player-equipment projection shared by equip_screen and debug_equip_screen. It takes a
  // PlayerSessionState directly and resolves no storage itself — no GameState, no
  // playerSessionStore, no campaign/debug branch.
  "core/equipmentScreenSnapshot.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/phases",
      "core/playerSessionState",
      "core/unitSpriteKey",
      "core/unitSprites",
      "core/unitStatsSnapshot",
      "core/unitUpgradePresentation",
      "data/itemDefinitions",
      "data/units",
      "inventory",
      "progression",
      "shared/snapshotTypes",
      "shared/unitTypes",
    ],
  },

  // The camp read model. Forwards progression's party status; recomputes no bound.
  "core/rosterCampSnapshot.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["core/phases", "data/units", "progression"],
  },

  // The upgrade-tree read model.
  "core/upgradeTreeSnapshot.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: [
      "core/phases",
      "core/unitSpriteKey",
      "core/unitSprites",
      "core/unitUpgradePresentation",
      "data/units",
      "progression",
    ],
  },

  // The READ-ONLY world projection. Campaign-world WRITES live in campaignWorldTransitions —
  // this allowlist is what keeps that split real: no store, no transformation module, so a
  // read-side module can never become the route to a campaign mutation.
  "core/worldMapProjection.ts": {
    kind: "exact-import-allowlist",
    allowedSpecifiers: ["campaign", "progression", "world/types"],
  },
};

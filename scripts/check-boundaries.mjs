#!/usr/bin/env node
// Boundary checker.
// Run: node scripts/check-boundaries.mjs
//
// Every module dependency form is detected (see scripts/import-scanner.mjs):
//   import ... from 'x'
//   export ... from 'x'
//   import 'x'          — side-effect import; runs the module body, binds nothing
//   import('x')
// Files are scanned whole, so multiline import lists are matched too.
//
// Import specifiers are normalized relative to the importing file before rules
// are applied, so a rule can be written once ("core/GameState") and still catch
// both `../core/GameState` from another layer and `./GameState` from inside
// core/ itself.

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { findImports } from "./import-scanner.mjs";
import { normalizeSpecifier as normalizeAgainstSrc } from "./import-specifier.mjs";
import {
  evaluateDirectoryPolicy,
  matchesPathPrefix,
} from "./boundary-policy.mjs";
import { findUncoveredLayers } from "./layer-coverage.mjs";
import { evaluatePhaseManagerPolicy } from "./phase-manager-policy.mjs";
import {
  PHASE_TRANSITION_RESOLVER_IMPORT_POLICY,
  PHASE_MANAGER_IMPORT_POLICY,
  PHASE_MANAGER_PUBLIC_API,
  PHASE_HANDLER_IMPORT_POLICIES,
  PHASE_HANDLER_COVERAGE_EXCLUSIONS,
  SCENES_IMPORT_POLICY,
  SCENE_CONTROL_POLICY,
  TRANSITION_CONTRACT_IMPORT_POLICIES,
  ORCHESTRATION_COLLABORATOR_REGISTRY,
  ORCHESTRATION_REGISTRY_COMPILATION,
  RUNTIME_OWNERSHIP_IMPORT_POLICIES,
  RESTRICTED_IMPORT_TARGETS,
  RUNTIME_OWNERSHIP_EXPORT_COMPILATION,
  GAME_STATE_FIELDS,
  GAME_STATE_PUBLIC_API,
} from "./orchestration-boundary-rules.mjs";
import { compareFacadeImports } from "./orchestration-collaborator-policy.mjs";
import {
  compileRestrictedImportTargets,
  evaluateObservedImport,
  findStaleImporterPermissions,
} from "./restricted-import-targets.mjs";
import { evaluateStateOwnershipPolicy } from "./state-ownership-policy.mjs";
import { evaluateModuleExportPolicy } from "./module-export-policy.mjs";
import { checkPhaseHandlerCoverage } from "./phase-handler-coverage.mjs";
import {
  findSceneControlCalls,
  evaluateSceneControlCalls,
} from "./scene-control-policy.mjs";

const SRC = new URL("../src", import.meta.url).pathname;
const errors = [];

function readTargetFile(absolutePath, policyLabel) {
  try {
    return readFileSync(absolutePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      errors.push(
        `  [${policyLabel}] boundary rule targets a missing file: ${relative(SRC, absolutePath)}`,
      );
      return null;
    }
    throw err;
  }
}

function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walkFiles(full);
      continue;
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    yield [full, readFileSync(full, "utf8")];
  }
}

const RULES = [
  {
    layer: "shared/**",
    root: "shared",
    policy: {
      kind: "blocklist",
      banned: [
        "battle",
        "core",
        "data",
        "objects",
        "scenes",
        "ui",
        "world",
        "save",
      ],
    },
  },
  {
    layer: "data/**",
    root: "data",
    policy: {
      kind: "blocklist",
      // data/ → shared/ is explicitly allowed
      banned: ["battle", "core", "objects", "scenes", "ui", "world", "save"],
    },
  },
  {
    layer: "world/**",
    root: "world",
    // world is a pure domain layer restricted by an allowlist, not a blocklist:
    // it may reach only its own modules and shared/ contracts. Because this is
    // closed rather than open, a future domain (save/, dialogue/, ...) is
    // rejected automatically without ever editing this rule.
    policy: {
      kind: "src-allowlist",
      allowedSrcRoots: ["world", "shared"],
      bannedPackages: ["phaser"],
    },
  },
  {
    layer: "battle/**",
    root: "battle",
    policy: {
      kind: "blocklist",
      banned: ["core", "campaign", "phaser", "save"],
    },
  },
  {
    layer: "ui/**",
    root: "ui",
    policy: {
      kind: "blocklist",
      // core/Constants (LAYOUT_SCALE) is explicitly allowed
      banned: [
        "core/GameState",
        "core/PhaseManager",
        "core/EventBus",
        "objects",
        "scenes",
        "battle",
        "world",
        "save",
      ],
    },
  },
  {
    layer: "objects/**",
    root: "objects",
    policy: {
      kind: "blocklist",
      // core/Constants, core/phases, core/unitSpriteKey, battle/types allowed; battle runtime modules banned
      banned: [
        "core/GameState",
        "core/PhaseManager",
        "core/EventBus",
        "scenes",
        "battle/combat",
        "battle/skillRuntime",
        "battle/skillPatterns",
        "battle/skillDefinitionRuntime",
        "battle/skillPreview",
        "battle/turnResolver",
        "save",
      ],
    },
  },
  {
    layer: "scenes/**",
    root: "scenes",
    policy: SCENES_IMPORT_POLICY,
  },
  {
    layer: "core/**",
    root: "core",
    policy: {
      kind: "blocklist",
      // core is the future orchestration layer for save/load — it is the only layer
      // allowed to import save/ (not yet exercised: no save action exists in this stage)
      banned: [
        "phaser",
        "ui/theme",
        "objects/battleVisualTheme",
        "objects/worldMapVisualTheme",
        "objects/itemVisualTheme",
        "objects/prepVisualTheme",
      ],
    },
  },
  {
    layer: "progression/**",
    root: "progression",
    policy: {
      kind: "blocklist",
      banned: ["core", "battle", "objects", "scenes", "ui", "world", "save"],
    },
  },
  {
    layer: "inventory/**",
    root: "inventory",
    policy: {
      kind: "blocklist",
      // inventory is a pure domain: only shared/ and data/ allowed (and local inventory/ imports)
      banned: [
        "battle",
        "core",
        "progression",
        "objects",
        "scenes",
        "ui",
        "world",
        "save",
      ],
    },
  },
  {
    layer: "campaign/**",
    root: "campaign",
    policy: {
      kind: "blocklist",
      // campaign is a persistent-state contract: shared/, progression/, inventory/, world/ (type
      // contracts) allowed; no battle/core/scenes/objects/ui. save/ is also banned here even
      // though SaveRepository references CampaignState — the dependency is one-way (save → campaign).
      banned: ["battle", "core", "objects", "scenes", "ui", "save"],
    },
  },
  {
    layer: "save/**",
    root: "save",
    // Closed allowlist, same shape as world/**: save/ may reach only itself, campaign/
    // (for the CampaignState contract) and shared/. No core/battle/rendering/Phaser.
    policy: {
      kind: "src-allowlist",
      allowedSrcRoots: ["save", "campaign", "shared"],
      bannedPackages: ["phaser"],
    },
  },
];

// Every current top-level directory under src/ is a real architectural
// layer and is covered by a RULES entry — this registry stays empty for
// now. Add an entry only when a top-level directory genuinely isn't a
// dependency layer (generated output, fixtures, etc.), e.g.:
//   { root: 'generated', reason: 'Build output, not a source dependency layer' }
const LAYER_COVERAGE_EXCLUSIONS = [];

function listTopLevelSourceDirectories() {
  return readdirSync(SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

const uncoveredLayers = findUncoveredLayers({
  discoveredRoots: listTopLevelSourceDirectories(),
  ruleRoots: RULES.map((rule) => rule.root),
  exclusions: LAYER_COVERAGE_EXCLUSIONS,
});

for (const root of uncoveredLayers) {
  errors.push(
    `  ${root}/**  [layer-coverage] has no directory boundary rule ` +
      "and no explicit exclusion with an architectural reason",
  );
}

// ─── Pure core modules ──────────────────────────────────────────────────────
// These compose domains but must not reach runtime storage or rendering.
// The single battle-start pipeline is the main architectural result of the
// persistent-dead stage; without these rules it could silently regrow a
// GameState dependency.
const PURE_CORE_FILES = [
  {
    // Campaign-world write transformations: (CampaignState, ...) => CampaignState, total and
    // storage-free. May import the `campaign` and `world` type contracts it transforms, but
    // never a store, a runtime, the phase unions, or a rendering layer — installing the result
    // is the caller's job (phaseHandlers/worldPhaseHandler.ts).
    file: join(SRC, "core", "campaignWorldTransitions.ts"),
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionStore",
      "core/battleRuntimeContext",
      "core/battleRuntimeAccess",
      "core/phases",
      "core/PhaseManager",
      "core/phaseActionEffects",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "battleSetupProjection.ts"),
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/phases",
      "core/PhaseManager",
      "campaign",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "battleParticipants.ts"),
    banned: [
      "progression",
      "inventory",
      "campaign",
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionStore",
      "core/phases",
      "core/PhaseManager",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "battleStart.ts"),
    // May import the core session CONTRACT (playerSessionState) — it is the
    // composition boundary — but never the runtime store or a rendering layer.
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionStore",
      "core/phases",
      "core/PhaseManager",
      "campaign",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "battleExit.ts"),
    // The source-neutral battle-result rule. May compose battle runtime contracts,
    // progression, the session CONTRACT and static definitions — never storage, never a
    // source key, never phase contracts.
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionStore",
      "core/phases",
      "core/PhaseManager",
      "campaign",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "playerBattleExitProjection.ts"),
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionState",
      "core/playerSessionStore",
      "core/phases",
      "core/PhaseManager",
      "campaign",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "battleResultsSnapshot.ts"),
    // A phase snapshot builder: it may import the phase snapshot CONTRACT
    // (BattleResultParticipantSeed / BattleResultUnit) type-only, exactly like
    // rosterCampSnapshot.ts and upgradeTreeSnapshot.ts. It receives a roster explicitly
    // and never resolves storage itself.
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionState",
      "core/playerSessionStore",
      "core/PhaseManager",
      "campaign",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
  {
    file: join(SRC, "core", "playerUnitPersistence.ts"),
    // The pure owner of persistent player-unit transformations. It may see battle
    // runtime contracts and progression roster contracts — never storage or a source key.
    banned: [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionState",
      "core/playerSessionStore",
      "core/phases",
      "core/PhaseManager",
      "campaign",
      "inventory",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ],
  },
];

// Relative specifiers are resolved against the importing file and expressed
// src-relative with posix separators, so rules use one vocabulary:
//   './GameState'        from src/core/x.ts    → core/GameState
//   '../campaign'        from src/core/x.ts    → campaign
//   '../../battle/types' from src/core/a/b.ts  → battle/types
// Bare package specifiers ('phaser', 'vitest') pass through unchanged.
//
// The rule itself lives in scripts/import-specifier.mjs so the tests that enforce
// the same boundaries share one implementation with this checker: two normalizations
// that disagreed about a single import would let a test pass while this failed.
function normalizeSpecifier(importerFile, spec) {
  return normalizeAgainstSrc({ srcRoot: SRC, importerFile, specifier: spec });
}

// ─── Pure phase transition resolver ─────────────────────────────────────────
// Resolver may import only phase contracts and the neutral metadata contract. Every other
// dependency is rejected. The policy itself lives in orchestration-boundary-rules.mjs so it
// is pinned by tests like every sibling allowlist.
const PHASE_TRANSITION_RESOLVER_FILE = join(
  SRC,
  "core",
  "phaseTransitionResolver.ts",
);

{
  const content = readTargetFile(
    PHASE_TRANSITION_RESOLVER_FILE,
    "phaseTransitionResolver allowlist",
  );

  for (const { spec, line } of content !== null ? findImports(content) : []) {
    const normalizedSpecifier = normalizeSpecifier(
      PHASE_TRANSITION_RESOLVER_FILE,
      spec,
    );

    const violation = evaluateDirectoryPolicy({
      policy: PHASE_TRANSITION_RESOLVER_IMPORT_POLICY,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });

    if (violation === null) continue;

    errors.push(
      `  core/phaseTransitionResolver.ts:${line} ` +
        `[phaseTransitionResolver allowlist] ` +
        `may import only ${violation.allowedSpecifiers.join(", ")}  →  "${spec}"`,
    );
  }
}

// ─── PhaseManager import allowlist ─────────────────────────────────────────
// PhaseManager is only the transition-pipeline coordinator. Any new dependency
// must be an explicit orchestration dependency approved here.
const PHASE_MANAGER_FILE = join(SRC, "core", "PhaseManager.ts");

{
  const content = readTargetFile(PHASE_MANAGER_FILE, "PhaseManager allowlist");

  for (const { spec, line } of content !== null ? findImports(content) : []) {
    const normalizedSpecifier = normalizeSpecifier(PHASE_MANAGER_FILE, spec);

    const violation = evaluateDirectoryPolicy({
      policy: PHASE_MANAGER_IMPORT_POLICY,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });

    if (violation === null) continue;

    errors.push(
      `  core/PhaseManager.ts:${line}  [PhaseManager allowlist] ` +
        `may import only approved orchestration modules  →  "${spec}"`,
    );
  }
}

// ─── PhaseManager source policy (coordinator + public API) ─────────────────
// One call site for every PhaseManager source rule: it must inspect no phase/action
// discriminator, and its public surface must stay within PHASE_MANAGER_PUBLIC_API.
{
  const content = readTargetFile(PHASE_MANAGER_FILE, "PhaseManager policy");

  for (const violation of content !== null
    ? evaluatePhaseManagerPolicy({
        sourceText: content,
        allowedPublicMembers: PHASE_MANAGER_PUBLIC_API,
      })
    : []) {
    errors.push(
      `  core/PhaseManager.ts:${violation.line} [${violation.rule}] ${violation.message}`,
    );
  }
}

// ─── Phase handler import allowlists ───────────────────────────────────────
for (const [handlerKey, policy] of Object.entries(PHASE_HANDLER_IMPORT_POLICIES)) {
  const file = join(SRC, ...handlerKey.split("/"));
  const content = readTargetFile(file, `${handlerKey} allowlist`);
  if (content === null) continue;

  for (const { spec, line } of findImports(content)) {
    const normalizedSpecifier = normalizeSpecifier(file, spec);
    const violation = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });
    if (violation === null) continue;

    errors.push(
      `  ${handlerKey}:${line}  [${handlerKey} allowlist] ` +
        `may import only approved dependencies  →  "${spec}"`,
    );
  }
}

// ─── Transition contract import allowlists ─────────────────────────────────
// The public/internal transition contracts (battleActionFeedback,
// phaseTransitionResult, phaseEffectsResult) are fail-closed: anything not
// explicitly approved — GameState, stores, handlers, RNG, Phaser — is rejected
// without needing to be enumerated.
for (const [contractKey, policy] of Object.entries(TRANSITION_CONTRACT_IMPORT_POLICIES)) {
  const file = join(SRC, ...contractKey.split("/"));
  const content = readTargetFile(file, `${contractKey} allowlist`);
  if (content === null) continue;

  for (const { spec, line } of findImports(content)) {
    const normalizedSpecifier = normalizeSpecifier(file, spec);
    const violation = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });
    if (violation === null) continue;

    errors.push(
      `  ${contractKey}:${line}  [${contractKey} allowlist] ` +
        `transition contracts may import only approved dependencies  →  "${spec}"`,
    );
  }
}

// ─── Orchestration facade collaborator registry ────────────────────────────
// The three facades beneath PhaseManager are closed the same way PhaseManager is, but with a
// classified registry rather than a bare list: every import is one reviewed collaborator EDGE,
// and the facade's kind bounds which roles it may register at all.
//
// Both directions are enforced. An exact allowlist alone catches a NEW unregistered import but
// not a STALE registration left behind after an import is deleted — a dormant licence for that
// dependency to return without review — so the two are reported as distinct violations.
//
// Compilation never throws: a malformed registry surfaces here as ordinary boundary violations
// with no enforceable policies behind them, failing the build loudly rather than quietly
// scanning against a partial allowlist.
const { problems: registryProblems, policies: facadeImportPolicies } =
  ORCHESTRATION_REGISTRY_COMPILATION;

for (const problem of registryProblems) {
  errors.push(`  [orchestration-collaborators] ${problem}`);
}

for (const [facadeKey, policy] of Object.entries(facadeImportPolicies)) {
  const file = join(SRC, ...facadeKey.split("/"));
  const content = readTargetFile(file, `${facadeKey} collaborators`);
  if (content === null) continue;

  const discoveredSpecifiers = [];

  for (const { spec, line } of findImports(content)) {
    const normalizedSpecifier = normalizeSpecifier(file, spec);
    discoveredSpecifiers.push(normalizedSpecifier);

    const violation = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });
    if (violation === null) continue;

    errors.push(
      `  ${facadeKey}:${line}  [${facadeKey} collaborators] unregistered collaborator — ` +
        `add an explicit role in ORCHESTRATION_COLLABORATOR_REGISTRY  →  "${spec}"`,
    );
  }

  // Unregistered imports are reported above WITH line numbers; only the set-level half is
  // taken from here, so no violation is printed twice.
  const { stale } = compareFacadeImports({
    facadeKey,
    discoveredSpecifiers,
    registry: ORCHESTRATION_COLLABORATOR_REGISTRY,
  });

  for (const specifier of stale) {
    errors.push(
      `  ${facadeKey}  [${facadeKey} collaborators] registered collaborator is no longer ` +
        `imported: "${specifier}" — remove it rather than leaving a dormant permission`,
    );
  }
}

// ─── Stage 4B: runtime ownership import allowlists ──────────────────────────
// GameState may hold only campaign/debug containers; storage stays rule-free; each gateway
// keeps its single responsibility. Same loop shape as every sibling allowlist above.
for (const [fileKey, policy] of Object.entries(RUNTIME_OWNERSHIP_IMPORT_POLICIES)) {
  const file = join(SRC, ...fileKey.split("/"));
  const content = readTargetFile(file, `${fileKey} allowlist`);
  if (content === null) continue;

  for (const { spec, line } of findImports(content)) {
    const normalizedSpecifier = normalizeSpecifier(file, spec);
    const violation = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier,
      isRelativeSpecifier: spec.startsWith("."),
    });
    if (violation === null) continue;

    errors.push(
      `  ${fileKey}:${line}  [${fileKey} allowlist] ` +
        `runtime ownership modules may import only approved dependencies  →  "${spec}"`,
    );
  }
}

// ─── Stage 4B: restricted import targets (importer direction) ───────────────
// Who may import a capability module, as opposed to what it may import. Compiles fail-closed:
// a malformed registry yields NO enforceable targets and reports its own problems, so a broken
// rule can never read as a satisfied one.
{
  const { problems, targets } = compileRestrictedImportTargets(RESTRICTED_IMPORT_TARGETS);

  for (const problem of problems) {
    errors.push(`  [restricted import targets] ${problem}`);
  }

  const observedEdges = [];

  for (const [file, content] of walkFiles(SRC)) {
    const importerKey = relative(SRC, file).split(sep).join("/");

    for (const { spec, line } of findImports(content)) {
      const normalizedSpecifier = normalizeSpecifier(file, spec);
      observedEdges.push({ importerKey, normalizedSpecifier });

      const violation = evaluateObservedImport({ importerKey, normalizedSpecifier, targets });
      if (violation === null) continue;

      errors.push(
        `  ${importerKey}:${line}  [restricted import target] ${violation.reason} ` +
          `May be imported only by ` +
          `${[...targets[violation.target].allowedImporters].join(", ")}  →  "${spec}"`,
      );
    }
  }

  for (const { target, importer } of findStaleImporterPermissions({ targets, observedEdges })) {
    errors.push(
      `  [restricted import target] stale permission: "${importer}" no longer imports ` +
        `"${target}" — remove it rather than leaving a dormant permission`,
    );
  }
}

// ─── Stage 4B: GameState ownership (stored fields + public API) ─────────────
{
  const file = join(SRC, "core", "GameState.ts");
  const content = readTargetFile(file, "GameState ownership policy");

  if (content !== null) {
    for (const problem of evaluateStateOwnershipPolicy({
      sourceText: content,
      className: "GameStateManager",
      fileName: "GameState.ts",
      allowedFields: GAME_STATE_FIELDS,
      allowedPublicApi: GAME_STATE_PUBLIC_API,
    })) {
      errors.push(`  core/GameState.ts  [GameState ownership] ${problem}`);
    }
  }
}

// ─── Stage 4B: runtime-ownership export surfaces ────────────────────────────
// Complements RESTRICTED_IMPORT_TARGETS: that controls WHO may import a restricted capability,
// this controls WHAT the permitted importers may expose publicly. Without both directions, an
// allowed importer can re-export the capability and every other module picks it up through an
// unrestricted specifier.
{
  const { problems, policies } = RUNTIME_OWNERSHIP_EXPORT_COMPILATION;

  for (const problem of problems) {
    errors.push(`  [runtime ownership export surface] ${problem}`);
  }

  for (const [fileKey, expectedExports] of Object.entries(policies)) {
    const file = join(SRC, ...fileKey.split("/"));
    // readTargetFile, not readFileSync: a moved or deleted protected module must become a
    // diagnosed violation rather than a silent skip.
    const content = readTargetFile(file, "runtime ownership export surface");
    if (content === null) continue;

    for (const problem of evaluateModuleExportPolicy({
      sourceText: content,
      fileName: fileKey,
      expectedExports,
    })) {
      errors.push(`  ${fileKey}  [runtime ownership export surface] ${problem}`);
    }
  }
}

// ─── Phase handler coverage ─────────────────────────────────────────────────
const discoveredHandlers = [...walkFiles(join(SRC, "core", "phaseHandlers"))].map(
  ([file]) => relative(SRC, file).split(sep).join("/"),
);

for (const problem of checkPhaseHandlerCoverage({
  discoveredHandlers,
  policies: PHASE_HANDLER_IMPORT_POLICIES,
  exclusions: PHASE_HANDLER_COVERAGE_EXCLUSIONS,
})) {
  errors.push(`  [phase-handler-coverage] ${problem}`);
}

// ─── Phaser scene-control scan ──────────────────────────────────────────────
for (const [file, content] of walkFiles(SRC)) {
  const relPath = relative(SRC, file).split(sep).join("/");
  const calls = findSceneControlCalls(content, relPath);
  if (calls.length === 0) continue;

  for (const problem of evaluateSceneControlCalls(calls, SCENE_CONTROL_POLICY[relPath])) {
    errors.push(`  ${relPath}:${problem.line}  [scene-control] ${problem.method}() ${problem.reason}`);
  }
}

// ─── Visual theme isolation ────────────────────────────────────────────────
// Domain visual theme files must not import from ui/theme.
// Importing UI_THEME would create a layering violation and risk circular deps.
for (const [file, content] of walkFiles(join(SRC, "objects"))) {
  if (!file.endsWith("VisualTheme.ts")) continue;
  for (const { spec, line } of findImports(content)) {
    if (matchesPathPrefix(normalizeSpecifier(file, spec), "ui/theme")) {
      errors.push(
        `  ${relative(SRC, file)}:${line}  [*VisualTheme.ts] must not import ui/theme  →  "${spec}"`,
      );
    }
  }
}

for (const { layer, root, policy } of RULES) {
  for (const [file, content] of walkFiles(join(SRC, root))) {
    for (const { spec, line } of findImports(content)) {
      const normalizedSpecifier = normalizeSpecifier(file, spec);
      const violation = evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier,
        isRelativeSpecifier: spec.startsWith("."),
      });

      if (violation === null) continue;

      if (violation.kind === "banned-path") {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] imports from ` +
            `${violation.entry}  →  "${spec}"`,
        );
      } else if (violation.kind === "outside-allowed-src-roots") {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] may import only ` +
            `${violation.allowedSrcRoots.join(", ")} within src  →  "${spec}"`,
        );
      } else {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] must not import package ` +
            `${violation.entry}  →  "${spec}"`,
        );
      }
    }
  }
}

for (const { file, banned } of PURE_CORE_FILES) {
  const content = readFileSync(file, "utf8");
  const rel = relative(SRC, file);
  for (const { spec, line } of findImports(content)) {
    const normalized = normalizeSpecifier(file, spec);
    for (const b of banned) {
      if (matchesPathPrefix(normalized, b)) {
        errors.push(
          `  ${rel}:${line}  [pure-core] must not import ${b}  →  "${spec}"`,
        );
      }
    }
  }
}

// ─── No ambient Math.random() in gameplay/domain code ─────────────────────
// Only src/core/random.ts may call Math.random(). All other battle and core
// code must use the Rng interface injected from PhaseManager.
const MATH_RANDOM_RE = /Math\.random\s*\(/g;
const AMBIENT_RANDOM_DIRS = [join(SRC, "battle"), join(SRC, "core")];
const AMBIENT_RANDOM_ALLOWLIST = [join(SRC, "core", "random.ts")];

for (const dir of AMBIENT_RANDOM_DIRS) {
  for (const [file, content] of walkFiles(dir)) {
    if (AMBIENT_RANDOM_ALLOWLIST.includes(file)) continue;
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      MATH_RANDOM_RE.lastIndex = 0;
      if (MATH_RANDOM_RE.test(line)) {
        const rel = relative(SRC, file);
        errors.push(
          `  ${rel}:${i + 1}  [no-ambient-random] Math.random() forbidden in gameplay code — use injected Rng`,
        );
      }
    });
  }
}

if (errors.length > 0) {
  console.error("Boundary violations found:\n");
  errors.forEach((e) => console.error(e));
  process.exit(1);
} else {
  console.log("✓ All boundaries clean");
}

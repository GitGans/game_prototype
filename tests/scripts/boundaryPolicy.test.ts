import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  evaluateDirectoryPolicy,
  matchesPathPrefix,
} from "../../scripts/boundary-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  PHASE_TRANSITION_RESOLVER_IMPORT_POLICY,
  PHASE_MANAGER_IMPORT_POLICY,
  PHASE_MANAGER_PUBLIC_API,
  PHASE_HANDLER_IMPORT_POLICIES,
  SCENES_IMPORT_POLICY,
  TRANSITION_CONTRACT_IMPORT_POLICIES,
  ORCHESTRATION_COLLABORATOR_REGISTRY,
  ORCHESTRATION_REGISTRY_COMPILATION,
  RUNTIME_OWNERSHIP_IMPORT_POLICIES,
  RESTRICTED_IMPORT_TARGETS,
  GAME_STATE_FIELDS,
  GAME_STATE_PUBLIC_API,
} from "../../scripts/orchestration-boundary-rules.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  FACADE_KIND_ROLES,
  compareFacadeImports,
} from "../../scripts/orchestration-collaborator-policy.mjs";
// The real facade sources are read with the SAME scanner and the SAME normalization the
// checker uses. A test-local re-implementation of either could disagree with production about
// a single import and turn this suite into false confidence.
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findImports } from "../../scripts/import-scanner.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { normalizeSpecifier } from "../../scripts/import-specifier.mjs";

describe("matchesPathPrefix", () => {
  it("matches at a path-segment boundary, not a substring", () => {
    expect(matchesPathPrefix("battle/types", "battle")).toBe(true);
    expect(matchesPathPrefix("battleFoo/types", "battle")).toBe(false);
    expect(matchesPathPrefix("phaser", "phaser")).toBe(true);
    expect(matchesPathPrefix("phaser/index", "phaser")).toBe(true);
  });
});

describe("evaluateDirectoryPolicy — blocklist", () => {
  it("flags a banned path", () => {
    expect(
      evaluateDirectoryPolicy({
        policy: { kind: "blocklist", banned: ["core/GameState"] },
        normalizedSpecifier: "core/GameState",
        isRelativeSpecifier: true,
      }),
    ).toEqual({ kind: "banned-path", entry: "core/GameState" });
  });

  it("allows anything not on the banned list", () => {
    expect(
      evaluateDirectoryPolicy({
        policy: { kind: "blocklist", banned: ["core/GameState"] },
        normalizedSpecifier: "shared/worldTypes",
        isRelativeSpecifier: true,
      }),
    ).toBeNull();
  });
});

describe("evaluateDirectoryPolicy — src-allowlist", () => {
  const policy = {
    kind: "src-allowlist",
    allowedSrcRoots: ["world", "shared"],
    bannedPackages: ["phaser"],
  };

  it("allows imports from allowed src roots", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "world/types",
        isRelativeSpecifier: true,
      }),
    ).toBeNull();

    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "shared/worldTypes",
        isRelativeSpecifier: true,
      }),
    ).toBeNull();
  });

  it("rejects a relative import outside the allowed src roots", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "core/GameState",
        isRelativeSpecifier: true,
      }),
    ).toEqual({
      kind: "outside-allowed-src-roots",
      allowedSrcRoots: ["world", "shared"],
    });
  });

  it("rejects a future, not-yet-existing src root the same way", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "save/saveTypes",
        isRelativeSpecifier: true,
      }),
    ).toEqual({
      kind: "outside-allowed-src-roots",
      allowedSrcRoots: ["world", "shared"],
    });
  });

  it("rejects an explicitly banned bare package", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "phaser",
        isRelativeSpecifier: false,
      }),
    ).toEqual({ kind: "banned-package", entry: "phaser" });
  });

  it("allows a bare package that is not explicitly banned", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "some-pure-utility",
        isRelativeSpecifier: false,
      }),
    ).toBeNull();
  });
});

describe("evaluateDirectoryPolicy — unknown policy kind", () => {
  it("throws rather than silently allowing the import", () => {
    expect(() =>
      evaluateDirectoryPolicy({
        // @ts-expect-error — intentionally invalid kind for this test
        policy: { kind: "nonsense" },
        normalizedSpecifier: "anything",
        isRelativeSpecifier: true,
      }),
    ).toThrow(/Unknown directory boundary policy kind/);
  });
});

describe("PHASE_MANAGER_IMPORT_POLICY (real production policy)", () => {
  const policy = PHASE_MANAGER_IMPORT_POLICY;

  it("pins the complete reviewed allowlist", () => {
    // Every specifier is a genuine coordinator or production-composition dependency. Any
    // further entry means a new dependency reached the coordinator, which must be an explicit
    // review — the count is not the rule, the enumerated set is.
    expect(policy).toEqual({
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
    });
  });

  it("allows an explicitly listed orchestration import", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "core/phaseTransitionResolver",
        isRelativeSpecifier: true,
      }),
    ).toBeNull();
  });

  it("rejects GameState", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "core/GameState",
        isRelativeSpecifier: true,
      }),
    ).toEqual({
      kind: "outside-exact-import-allowlist",
      allowedSpecifiers: policy.allowedSpecifiers,
    });
  });

  it("rejects domain handlers", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "core/phaseHandlers/battlePhaseHandler",
        isRelativeSpecifier: true,
      }),
    ).toEqual({
      kind: "outside-exact-import-allowlist",
      allowedSpecifiers: policy.allowedSpecifiers,
    });
  });

  it("rejects external packages", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "phaser",
        isRelativeSpecifier: false,
      }),
    ).toEqual({
      kind: "outside-exact-import-allowlist",
      allowedSpecifiers: policy.allowedSpecifiers,
    });
  });
});

describe("PHASE_MANAGER_PUBLIC_API (real production policy)", () => {
  it("pins the exact public surface", () => {
    // The coordinator's whole surface. Widening it is how every removed transitional API
    // (stored results, RNG resets, refreshSnapshot) originally got in.
    expect(PHASE_MANAGER_PUBLIC_API).toEqual(["init", "getPhase", "transition"]);
  });
});

describe("PHASE_HANDLER_IMPORT_POLICIES — worldPhaseHandler (real production policy)", () => {
  // worldPhaseHandler is the only phase handler permitted to touch the battle runtime seam:
  // its world consequence must validate runtime-vs-phase itself rather than trusting an
  // earlier caller. That makes its allowlist the easiest one to widen by accident, so pin it
  // exactly — its siblings resolve storage through PlayerSessionStore and nothing else.
  const policy = PHASE_HANDLER_IMPORT_POLICIES["core/phaseHandlers/worldPhaseHandler.ts"];

  it("is registered, so the coverage check does not fail the build", () => {
    expect(policy).toBeDefined();
  });

  it("pins the exact reviewed dependency set", () => {
    expect(policy).toEqual({
      kind: "exact-import-allowlist",
      allowedSpecifiers: [
        "core/GameState",
        "core/phases",
        "core/battleRuntimeContext",
        "core/battleRuntimeAccess",
        "core/campaignWorldTransitions",
      ],
    });
  });

  it.each([
    // The pure transformation module is allowed; the read-side projection is not — a handler
    // reaching for worldMapProjection would be rebuilding a snapshot from the write side.
    ["core/campaignWorldTransitions", null],
    ["core/worldMapProjection", "outside-exact-import-allowlist"],
    // No handler may reach the effects facade or the coordinator: dependencies point one way.
    ["core/phaseActionEffects", "outside-exact-import-allowlist"],
    ["core/PhaseManager", "outside-exact-import-allowlist"],
    ["phaser", "outside-exact-import-allowlist"],
  ])("evaluates %s as %s", (specifier: string, expected: string | null) => {
    const result = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier: specifier,
      isRelativeSpecifier: true,
    });
    expect(result === null ? null : result.kind).toBe(expected);
  });
});

describe("SCENES_IMPORT_POLICY (real production policy)", () => {
  const policy = SCENES_IMPORT_POLICY;

  it("permits an unrelated import", () => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: "objects/UnitView",
        isRelativeSpecifier: true,
      }),
    ).toBeNull();
  });

  it.each(policy.banned as string[])("rejects banned import %s", (banned: string) => {
    expect(
      evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier: banned,
        isRelativeSpecifier: true,
      }),
    ).toEqual({ kind: "banned-path", entry: banned });
  });

  // Every module a scene must not reach, pinned explicitly. The generic table above
  // iterates whatever `policy.banned` happens to contain, so it stays green if an
  // entry is deleted; this list is what makes a deletion fail.
  const PROTECTED_INTERNALS = [
    "core/GameState",
    "core/DebugBattleState",
    "core/playerSessionStore",
    "core/debugLifecycle",
    "core/campaignLifecycle",
    "core/phaseHandlers",
    "core/phaseActionEffects",
    "core/battlePhaseEffects",
    "core/campaignWorldTransitions",
    "core/phaseTransitionMetadata",
    "core/phaseSnapshotRebuilder",
    "core/phaseTransitionResolver",
    "core/phaseTransitionMetadataContract",
    "core/phaseChangeNotifier",
    "core/phaseEffectsResult",
    "core/battleRuntimeContext",
    "core/battleRuntimeAccess",
    "core/battleRuntimeStorage",
    "core/battleRuntimeWriteAccess",
    "core/battlePhaseSnapshot",
    "core/battleSnapshotBuilder",
    "core/battleResultsSnapshot",
    "core/equipmentScreenSnapshot",
    "core/unitStatsSnapshot",
    "core/rosterCampSnapshot",
    "core/upgradeTreeSnapshot",
    "core/worldMapProjection",
  ];

  it.each(PROTECTED_INTERNALS)(
    "bans %s in the production policy and rejects it through the evaluator",
    (entry: string) => {
      expect(policy.banned).toContain(entry);
      expect(
        evaluateDirectoryPolicy({
          policy,
          normalizedSpecifier: entry,
          isRelativeSpecifier: true,
        }),
      ).toEqual({ kind: "banned-path", entry });
    },
  );

  // These derive transient presentation models from committed GamePhase data or
  // call-scoped transition feedback. They resolve no authoritative state and build
  // no part of the committed snapshot, so scenes import them by design — see
  // scenes/controllers/BattleTurnFlowController.ts and BattlePresentationController.ts.
  // Banning them would break the scene layer, so pin them as permitted.
  it("keeps the scene-facing presentation adapters importable", () => {
    for (const entry of ["core/battleDirectiveProjection", "core/battleSkillPreviewProjection"]) {
      expect(policy.banned).not.toContain(entry);
      expect(
        evaluateDirectoryPolicy({
          policy,
          normalizedSpecifier: entry,
          isRelativeSpecifier: true,
        }),
      ).toBeNull();
    }
  });

  // The public/internal split is itself a rule: banning a public contract would
  // break the scene layer. The internal half is pinned by PROTECTED_INTERNALS above.
  it("leaves the public transition contracts importable by scenes", () => {
    for (const entry of ["core/phaseTransitionResult", "core/battleActionFeedback"]) {
      expect(policy.banned).not.toContain(entry);
    }
  });

  it("bans battleRuntimeAccess as its own entry, not via the battleRuntimeContext prefix", () => {
    expect(matchesPathPrefix("core/battleRuntimeAccess", "core/battleRuntimeContext")).toBe(false);
  });
});

describe("TRANSITION_CONTRACT_IMPORT_POLICIES", () => {
  /**
   * Pinned exactly, not spot-checked.
   *
   * A rejection-only test does not stay closed: appending
   * "core/phaseHandlers/battlePhaseHandler" to one of these allowlists would leave
   * a "rejects core/GameState" assertion green while re-opening the boundary. This
   * assertion makes weakening any contract boundary require a visible test edit.
   */
  it("pins the complete allowlist of every transition contract module", () => {
    expect(TRANSITION_CONTRACT_IMPORT_POLICIES).toEqual({
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
      // Must stay EMPTY. The module exists so a GameState-reading deriver and a pure router
      // can share a type without depending on each other; one import here would make it a
      // shared dependency of both and re-open exactly that edge.
      "core/phaseTransitionMetadataContract.ts": {
        kind: "exact-import-allowlist",
        allowedSpecifiers: [],
      },
    });
  });

  // Separate concern from the pin above: that the evaluator actually enforces it.
  const contractEntries = Object.entries(
    TRANSITION_CONTRACT_IMPORT_POLICIES as Record<string, { allowedSpecifiers: string[] }>,
  );

  it.each(contractEntries)(
    "%s rejects a stateful dependency",
    (_key: string, contractPolicy: { allowedSpecifiers: string[] }) => {
      expect(
        evaluateDirectoryPolicy({
          policy: contractPolicy,
          normalizedSpecifier: "core/GameState",
          isRelativeSpecifier: true,
        }),
      ).toEqual({
        kind: "outside-exact-import-allowlist",
        allowedSpecifiers: contractPolicy.allowedSpecifiers,
      });
    },
  );

  it.each(contractEntries)(
    "%s accepts each of its own approved specifiers",
    (_key: string, contractPolicy: { allowedSpecifiers: string[] }) => {
      for (const allowed of contractPolicy.allowedSpecifiers) {
        expect(
          evaluateDirectoryPolicy({
            policy: contractPolicy,
            normalizedSpecifier: allowed,
            isRelativeSpecifier: true,
          }),
        ).toBeNull();
      }
    },
  );
});

describe("PHASE_TRANSITION_RESOLVER_IMPORT_POLICY (real production policy)", () => {
  const policy = PHASE_TRANSITION_RESOLVER_IMPORT_POLICY;

  it("pins the router's complete allowlist", () => {
    // The resolver's purity is load-bearing rather than a checker convenience: it must import
    // in Node with zero browser globals and read no state. Two entries only — the phase
    // contracts it routes over, and the neutral metadata contract it receives facts through.
    expect(policy).toEqual({
      kind: "exact-import-allowlist",
      allowedSpecifiers: ["core/phases", "core/phaseTransitionMetadataContract"],
    });
  });

  it.each([
    ["core/phases", null],
    ["core/phaseTransitionMetadataContract", null],
    // The derivation module reads GameState. Importing it back here — e.g. to re-export the
    // metadata type — would break the resolver's purity, not merely a rule.
    ["core/phaseTransitionMetadata", "outside-exact-import-allowlist"],
    ["core/GameState", "outside-exact-import-allowlist"],
    ["core/phaseActionEffects", "outside-exact-import-allowlist"],
    ["phaser", "outside-exact-import-allowlist"],
  ])("evaluates %s as %s", (specifier: string, expected: string | null) => {
    const result = evaluateDirectoryPolicy({
      policy,
      normalizedSpecifier: specifier,
      isRelativeSpecifier: specifier !== "phaser",
    });
    expect(result === null ? null : result.kind).toBe(expected);
  });
});

describe("FACADE_KIND_ROLES (real production policy)", () => {
  it("pins the complete facade-kind to collaborator-role matrix", () => {
    // This table is what actually enforces authority: `effects` cannot register a state reader
    // or a snapshot projection, and neither read-side facade can register an effects owner.
    // Distinctions *within* a row are descriptive classification, not extra enforcement.
    // Widening any row must be a visible edit here.
    expect(FACADE_KIND_ROLES).toEqual({
      effects: ["neutral-contract", "effects-owner", "effects-infrastructure"],
      metadata: [
        "neutral-contract",
        "authoritative-state-reader",
        "metadata-source",
        "metadata-rule",
      ],
      snapshot: ["neutral-contract", "authoritative-state-reader", "snapshot-projection"],
    });
  });
});

describe("ORCHESTRATION_COLLABORATOR_REGISTRY (real production policy)", () => {
  /**
   * Pinned exactly, roles included — same argument as TRANSITION_CONTRACT_IMPORT_POLICIES
   * above. A rejection-only test does not stay closed: appending one `effects-owner` line to
   * the snapshot facade would leave every "rejects X" assertion green while handing a read-side
   * module the authority to mutate.
   */
  it("pins every facade, every collaborator and every role", () => {
    expect(ORCHESTRATION_COLLABORATOR_REGISTRY).toEqual({
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
          { specifier: "core/random", role: "effects-infrastructure" },
        ],
      },
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
    });
  });

  it("compiles cleanly, so the checker has real policies to enforce", () => {
    // Compilation returns NO policies when the registry is invalid. Without this assertion an
    // empty `policies` — i.e. nothing enforced at all — would look identical to a clean run.
    expect(ORCHESTRATION_REGISTRY_COMPILATION.problems).toEqual([]);
    expect(Object.keys(ORCHESTRATION_REGISTRY_COMPILATION.policies)).toEqual(
      Object.keys(ORCHESTRATION_COLLABORATOR_REGISTRY),
    );
  });

  it("compiles each facade's registered specifiers into its exact allowlist", () => {
    for (const [facadeKey, entry] of Object.entries(
      ORCHESTRATION_COLLABORATOR_REGISTRY as Record<string, { collaborators: { specifier: string }[] }>,
    )) {
      expect(ORCHESTRATION_REGISTRY_COMPILATION.policies[facadeKey]).toEqual({
        kind: "exact-import-allowlist",
        allowedSpecifiers: entry.collaborators.map(({ specifier }) => specifier),
      });
    }
  });

  const facadePolicy = (facadeKey: string) =>
    ORCHESTRATION_REGISTRY_COMPILATION.policies[facadeKey];

  it.each([
    // The write side sequences owners: it holds no store, no read-side half, no projection.
    ["core/GameState"],
    ["core/playerSessionStore"],
    ["core/phaseTransitionMetadata"],
    ["core/phaseSnapshotRebuilder"],
    ["core/battlePhaseSnapshot"],
    ["core/worldMapProjection"],
    ["data/mapDefinitions"],
    ["phaser"],
  ])("phaseActionEffects rejects %s", (specifier: string) => {
    expect(
      evaluateDirectoryPolicy({
        policy: facadePolicy("core/phaseActionEffects.ts"),
        normalizedSpecifier: specifier,
        isRelativeSpecifier: specifier !== "phaser",
      })?.kind,
    ).toBe("outside-exact-import-allowlist");
  });

  it.each([
    // The whole reason PhaseTransitionMetadata moved to its own module: registering the
    // resolver here would let the metadata facade call resolveTransition.
    ["core/phaseTransitionResolver"],
    ["core/campaignLifecycle"],
    ["core/debugLifecycle"],
    ["core/phaseActionEffects"],
    ["core/battlePhaseEffects"],
    ["core/battlePhaseSnapshot"],
    ["core/phaseSnapshotRebuilder"],
    ["phaser"],
  ])("phaseTransitionMetadata rejects %s", (specifier: string) => {
    expect(
      evaluateDirectoryPolicy({
        policy: facadePolicy("core/phaseTransitionMetadata.ts"),
        normalizedSpecifier: specifier,
        isRelativeSpecifier: specifier !== "phaser",
      })?.kind,
    ).toBe("outside-exact-import-allowlist");
  });

  it.each([
    ["core/campaignLifecycle"],
    ["core/debugLifecycle"],
    ["core/phaseActionEffects"],
    ["core/campaignWorldTransitions"],
    // A metadata rule the snapshot facade never registered: read-side membership is not a
    // blanket licence for every read-side module.
    ["world/mapCompletion"],
    ["scenes/phaserSceneSynchronizer"],
    ["phaser"],
  ])("phaseSnapshotRebuilder rejects %s", (specifier: string) => {
    expect(
      evaluateDirectoryPolicy({
        policy: facadePolicy("core/phaseSnapshotRebuilder.ts"),
        normalizedSpecifier: specifier,
        isRelativeSpecifier: specifier !== "phaser",
      })?.kind,
    ).toBe("outside-exact-import-allowlist");
  });

  it.each(Object.keys(ORCHESTRATION_COLLABORATOR_REGISTRY))(
    "%s accepts every collaborator registered for it",
    (facadeKey: string) => {
      const policy = facadePolicy(facadeKey);

      for (const { specifier } of ORCHESTRATION_COLLABORATOR_REGISTRY[facadeKey].collaborators) {
        expect(
          evaluateDirectoryPolicy({
            policy,
            normalizedSpecifier: specifier,
            isRelativeSpecifier: true,
          }),
        ).toBeNull();
      }
    },
  );
});

describe("ORCHESTRATION_COLLABORATOR_REGISTRY against the real facade sources", () => {
  /**
   * A second, independent enforcement path. `node scripts/check-boundaries.mjs` prints
   * "✓ All boundaries clean" on clean source whether its facade loop enforces everything or
   * nothing, so this suite re-derives the comparison from the real files under `npm test`:
   * drift between a facade's actual imports and its registration fails here even if the
   * checker's loop is later edited or removed.
   *
   * It does NOT verify that check-boundaries.mjs is wired correctly or that it reports the
   * violation — that would need a subprocess test of the executable, deliberately out of
   * scope. Same scanner, same normalization as production; see the imports at the top.
   */
  const SRC = new URL("../../src/", import.meta.url);

  it.each(Object.keys(ORCHESTRATION_COLLABORATOR_REGISTRY))(
    "%s imports exactly its registered collaborators",
    (facadeKey: string) => {
      const importerFile = new URL(facadeKey, SRC).pathname;

      const discoveredSpecifiers = [
        ...findImports(readFileSync(importerFile, "utf8")),
      ].map(({ spec }: { spec: string }) =>
        normalizeSpecifier({ srcRoot: SRC.pathname, importerFile, specifier: spec }),
      );

      expect(
        compareFacadeImports({
          facadeKey,
          discoveredSpecifiers,
          registry: ORCHESTRATION_COLLABORATOR_REGISTRY,
        }),
      ).toEqual({ unregistered: [], stale: [] });
    },
  );
});

// ─── Stage 4B: battle-runtime read/write ownership ──────────────────────────

describe("runtime ownership import allowlists", () => {
  /**
   * The exact outbound dependency set of GameState and the battle-runtime triad.
   *
   * Pinned literally rather than derived: GameState's four specifiers ARE the statement
   * "campaign and debug containers only", and the write gateway's two ARE the statement
   * "it may not acquire a read". Deriving either from the source would make the test agree
   * with whatever the source happens to do.
   */
  it("pins the exact allowlists", () => {
    expect(RUNTIME_OWNERSHIP_IMPORT_POLICIES).toEqual({
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
    });
  });

  it("rejects GameState importing battle runtime again", () => {
    expect(
      evaluateDirectoryPolicy({
        policy: RUNTIME_OWNERSHIP_IMPORT_POLICIES["core/GameState.ts"],
        normalizedSpecifier: "core/battleRuntimeContext",
        isRelativeSpecifier: true,
      }),
    ).toMatchObject({ kind: "outside-exact-import-allowlist" });
  });

  it("rejects the write gateway acquiring a read", () => {
    expect(
      evaluateDirectoryPolicy({
        policy: RUNTIME_OWNERSHIP_IMPORT_POLICIES["core/battleRuntimeWriteAccess.ts"],
        normalizedSpecifier: "core/battleRuntimeAccess",
        isRelativeSpecifier: true,
      }),
    ).toMatchObject({ kind: "outside-exact-import-allowlist" });
  });

  it("rejects storage acquiring any rule dependency", () => {
    for (const specifier of ["core/phases", "core/GameState", "core/playerSessionState"]) {
      expect(
        evaluateDirectoryPolicy({
          policy: RUNTIME_OWNERSHIP_IMPORT_POLICIES["core/battleRuntimeStorage.ts"],
          normalizedSpecifier: specifier,
          isRelativeSpecifier: true,
        }),
      ).toMatchObject({ kind: "outside-exact-import-allowlist" });
    }
  });

  /**
   * Real-source parity, in BOTH directions, using the same scanner and normalization as the
   * checker. An allowlist alone catches a new unregistered import but not a stale entry left
   * behind after one is deleted — a dormant permission for that dependency to return.
   */
  const SRC = new URL("../../src/", import.meta.url);

  it.each(Object.keys(RUNTIME_OWNERSHIP_IMPORT_POLICIES))(
    "%s imports exactly its allowed specifiers",
    (fileKey: string) => {
      const importerFile = new URL(fileKey, SRC).pathname;
      const policy = RUNTIME_OWNERSHIP_IMPORT_POLICIES[fileKey];

      const discovered = [...findImports(readFileSync(importerFile, "utf8"))].map(
        ({ spec }: { spec: string }) =>
          normalizeSpecifier({ srcRoot: SRC.pathname, importerFile, specifier: spec }),
      );

      const violations = discovered.filter(
        (normalizedSpecifier: string) =>
          evaluateDirectoryPolicy({
            policy,
            normalizedSpecifier,
            isRelativeSpecifier: true,
          }) !== null,
      );
      expect(violations).toEqual([]);

      const stale = policy.allowedSpecifiers.filter(
        (specifier: string) => !discovered.includes(specifier),
      );
      expect(stale).toEqual([]);
    },
  );
});

describe("GameState ownership registries", () => {
  it("pins the exact stored-field list", () => {
    expect(GAME_STATE_FIELDS).toEqual(["campaignState", "debugState"]);
  });

  it("pins the exact public surface", () => {
    expect(GAME_STATE_PUBLIC_API).toEqual([
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
    ]);
  });

  it("registers no battle-runtime member in either dimension", () => {
    for (const name of [...GAME_STATE_FIELDS, ...GAME_STATE_PUBLIC_API]) {
      expect(name.toLowerCase()).not.toContain("battle");
    }
  });
});

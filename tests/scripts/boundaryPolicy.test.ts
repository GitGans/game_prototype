import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  evaluateDirectoryPolicy,
  matchesPathPrefix,
} from "../../scripts/boundary-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  PHASE_MANAGER_IMPORT_POLICY,
  SCENES_IMPORT_POLICY,
  TRANSITION_CONTRACT_IMPORT_POLICIES,
} from "../../scripts/orchestration-boundary-rules.mjs";

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
    "core/phaseHandlers",
    "core/phaseActionEffects",
    "core/phaseTransitionMetadata",
    "core/phaseSnapshotRebuilder",
    "core/phaseTransitionResolver",
    "core/phaseChangeNotifier",
    "core/phaseEffectsResult",
    "core/battleRuntimeContext",
    "core/battleRuntimeAccess",
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

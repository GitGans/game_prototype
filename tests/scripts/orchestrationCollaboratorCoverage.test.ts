import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { compileCollaboratorCoverage } from "../../scripts/orchestration-collaborator-coverage.mjs";

/**
 * Unit tests for the pure Stage 4C reverse-coverage compiler, driven entirely by SYNTHETIC
 * registries and source-file lists. The real registries are exercised separately in
 * tests/scripts/boundaryPolicy.test.ts; here the point is the mechanism, especially its
 * fail-closed behaviour — every configuration problem must yield an EMPTY coverage set, because
 * a partially compiled set enforces less than the registry says while looking satisfied.
 */

const STAGE_4C = "ORCHESTRATION_COLLABORATOR_IMPORT_POLICIES";

type Collaborator = { specifier: string; role: string };

function facadeRegistry(collaborators: Collaborator[], facadeKey = "core/exampleFacade.ts") {
  return { [facadeKey]: { kind: "effects", collaborators } };
}

function policiesOf(entries: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(entries).map(([fileKey, allowedSpecifiers]) => [
      fileKey,
      { kind: "exact-import-allowlist", allowedSpecifiers },
    ]),
  );
}

/** The default happy-path call: one non-neutral collaborator with one Stage 4C policy. */
function compile(overrides: Record<string, unknown> = {}) {
  return compileCollaboratorCoverage({
    registry: facadeRegistry([
      { specifier: "core/phases", role: "neutral-contract" },
      { specifier: "core/debugLifecycle", role: "effects-owner" },
    ]),
    policyRegistries: [
      { name: STAGE_4C, policies: policiesOf({ "core/debugLifecycle.ts": ["core/GameState"] }) },
    ],
    stage4cRegistryName: STAGE_4C,
    sourceFiles: ["core/exampleFacade.ts", "core/phases.ts", "core/debugLifecycle.ts"],
    ...overrides,
  });
}

describe("compileCollaboratorCoverage — deriving obligations", () => {
  it("exempts neutral contracts and requires every other role", () => {
    const { problems, coverage } = compile();

    expect(problems).toEqual([]);
    // core/phases is neutral and needs no policy; core/debugLifecycle is the sole obligation.
    expect(coverage).toEqual([
      {
        specifier: "core/debugLifecycle",
        fileKey: "core/debugLifecycle.ts",
        registryName: STAGE_4C,
        policy: { kind: "exact-import-allowlist", allowedSpecifiers: ["core/GameState"] },
      },
    ]);
  });

  it("reports a non-neutral collaborator with no policy anywhere", () => {
    const { problems, coverage } = compile({
      policyRegistries: [{ name: STAGE_4C, policies: {} }],
    });

    expect(problems).toEqual([
      `"core/debugLifecycle.ts" is a facade collaborator with no exact import policy — ` +
        `add one to ${STAGE_4C}`,
    ]);
    expect(coverage).toEqual([]);
  });

  it("reports a module owned by two policy registries", () => {
    const { problems, coverage } = compile({
      policyRegistries: [
        { name: "OTHER", policies: policiesOf({ "core/debugLifecycle.ts": [] }) },
        { name: STAGE_4C, policies: policiesOf({ "core/debugLifecycle.ts": [] }) },
      ],
    });

    expect(problems).toEqual([
      `"core/debugLifecycle.ts" has import policies in OTHER and ${STAGE_4C} — ` +
        `exactly one registry must be authoritative`,
    ]);
    expect(coverage).toEqual([]);
  });

  it("collapses a specifier registered by two facades into one obligation", () => {
    const { problems, coverage } = compile({
      registry: {
        "core/facadeA.ts": {
          kind: "metadata",
          collaborators: [{ specifier: "core/debugLifecycle", role: "metadata-source" }],
        },
        "core/facadeB.ts": {
          kind: "effects",
          collaborators: [{ specifier: "core/debugLifecycle", role: "effects-owner" }],
        },
      },
      sourceFiles: ["core/facadeA.ts", "core/facadeB.ts", "core/debugLifecycle.ts"],
    });

    expect(problems).toEqual([]);
    expect(coverage).toHaveLength(1);
  });

  it("keeps a specifier required when it is neutral for one facade and not another", () => {
    const { problems, coverage } = compile({
      registry: {
        "core/facadeA.ts": {
          kind: "effects",
          collaborators: [{ specifier: "core/debugLifecycle", role: "neutral-contract" }],
        },
        "core/facadeB.ts": {
          kind: "effects",
          collaborators: [{ specifier: "core/debugLifecycle", role: "effects-owner" }],
        },
      },
      sourceFiles: ["core/facadeA.ts", "core/facadeB.ts", "core/debugLifecycle.ts"],
    });

    // The stricter classification wins: being neutral somewhere is not an exemption.
    expect(problems).toEqual([]);
    expect(coverage.map((entry: { fileKey: string }) => entry.fileKey)).toEqual([
      "core/debugLifecycle.ts",
    ]);
  });
});

describe("compileCollaboratorCoverage — stale Stage 4C entries", () => {
  it("rejects a Stage 4C entry that is not a facade collaborator", () => {
    const { problems, coverage } = compile({
      policyRegistries: [
        {
          name: STAGE_4C,
          policies: policiesOf({
            "core/debugLifecycle.ts": ["core/GameState"],
            "core/orphan.ts": [],
          }),
        },
      ],
      sourceFiles: [
        "core/exampleFacade.ts",
        "core/phases.ts",
        "core/debugLifecycle.ts",
        "core/orphan.ts",
      ],
    });

    expect(problems).toEqual([
      `stale ${STAGE_4C} entry "core/orphan.ts" — it is not a facade collaborator; ` +
        `remove it rather than leaving a dormant permission`,
    ]);
    expect(coverage).toEqual([]);
  });

  it("allows non-collaborator entries in the other canonical registries", () => {
    // The real registries legitimately govern modules no facade imports —
    // core/phaseHandlers/battlePhaseHandler.ts, the runtime storage cell, the write gateway.
    // The stale rule must not reach them.
    const { problems, coverage } = compile({
      policyRegistries: [
        {
          name: "PHASE_HANDLER_IMPORT_POLICIES",
          policies: policiesOf({ "core/phaseHandlers/notACollaborator.ts": [] }),
        },
        { name: STAGE_4C, policies: policiesOf({ "core/debugLifecycle.ts": [] }) },
      ],
      sourceFiles: [
        "core/exampleFacade.ts",
        "core/phases.ts",
        "core/debugLifecycle.ts",
        "core/phaseHandlers/notACollaborator.ts",
      ],
    });

    expect(problems).toEqual([]);
    expect(coverage).toHaveLength(1);
  });
});

describe("compileCollaboratorCoverage — source resolution", () => {
  it.each([
    ["core/thing.ts", "core/thing.ts"],
    ["core/thing.tsx", "core/thing.tsx"],
    ["core/thing/index.ts", "core/thing/index.ts"],
    ["core/thing/index.tsx", "core/thing/index.tsx"],
  ])("resolves a collaborator through %s", (sourceFile: string, expectedKey: string) => {
    const { problems, coverage } = compile({
      registry: facadeRegistry([{ specifier: "core/thing", role: "effects-owner" }]),
      policyRegistries: [{ name: STAGE_4C, policies: policiesOf({ [expectedKey]: [] }) }],
      sourceFiles: ["core/exampleFacade.ts", sourceFile],
    });

    expect(problems).toEqual([]);
    expect(coverage[0].fileKey).toBe(expectedKey);
  });

  it("rejects an ambiguous resolution rather than picking one", () => {
    const { problems, coverage } = compile({
      registry: facadeRegistry([{ specifier: "core/thing", role: "effects-owner" }]),
      policyRegistries: [{ name: STAGE_4C, policies: {} }],
      sourceFiles: ["core/exampleFacade.ts", "core/thing.ts", "core/thing/index.ts"],
    });

    expect(problems).toEqual([
      `collaborator "core/thing" resolves ambiguously to core/thing.ts, core/thing/index.ts`,
    ]);
    expect(coverage).toEqual([]);
  });

  it("rejects a collaborator with no source module instead of reading it as zero imports", () => {
    const { problems, coverage } = compile({
      registry: facadeRegistry([{ specifier: "core/missing", role: "effects-owner" }]),
      policyRegistries: [{ name: STAGE_4C, policies: {} }],
      sourceFiles: ["core/exampleFacade.ts"],
    });

    // The vacuous pass this guards against: a deleted module silently satisfying its policy.
    expect(problems).toEqual([`collaborator "core/missing" resolves to no source module`]);
    expect(coverage).toEqual([]);
  });
});

describe("compileCollaboratorCoverage — fails closed on malformed configuration", () => {
  const expectNoCoverage = (result: { problems: string[]; coverage: unknown[] }) => {
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.coverage).toEqual([]);
  };

  it("rejects something that is not a registry at all, without throwing", () => {
    expectNoCoverage(compile({ registry: null }));
    expectNoCoverage(compile({ registry: [] }));
  });

  it("rejects a malformed facade registry", () => {
    expectNoCoverage(compile({ registry: { "core/f.ts": { kind: "effects" } } }));
  });

  it("rejects an unknown collaborator role", () => {
    // Unknown roles must fail CLOSED — never slip through as "not neutral, so ignore" and
    // never as "not known, so exempt".
    expectNoCoverage(
      compile({
        registry: facadeRegistry([{ specifier: "core/debugLifecycle", role: "made-up-role" }]),
      }),
    );
  });

  it("rejects a malformed policy-registry descriptor", () => {
    expectNoCoverage(compile({ policyRegistries: "nope" }));
    expectNoCoverage(compile({ policyRegistries: [null] }));
    expectNoCoverage(compile({ policyRegistries: [{ policies: {} }] }));
    expectNoCoverage(
      compile({ policyRegistries: [{ name: STAGE_4C, policies: {}, extra: 1 }] }),
    );
    expectNoCoverage(compile({ policyRegistries: [{ name: STAGE_4C, policies: "nope" }] }));
  });

  it("rejects duplicate policy-registry names", () => {
    const result = compile({
      policyRegistries: [
        { name: STAGE_4C, policies: {} },
        { name: STAGE_4C, policies: {} },
      ],
    });

    expect(result.problems).toContain(`duplicate policy registry name "${STAGE_4C}"`);
    expect(result.coverage).toEqual([]);
  });

  it("rejects a stage4cRegistryName that names no supplied registry", () => {
    const result = compile({ stage4cRegistryName: "NOT_SUPPLIED" });

    expect(result.problems).toContain(
      `stage4cRegistryName "NOT_SUPPLIED" names no supplied policy registry`,
    );
    expect(result.coverage).toEqual([]);
  });

  it("rejects an unknown policy kind rather than passing it to evaluateDirectoryPolicy", () => {
    // evaluateDirectoryPolicy THROWS on an unknown kind, so it must never receive one: the
    // checker would die instead of reporting a boundary violation.
    const result = compile({
      policyRegistries: [
        {
          name: STAGE_4C,
          policies: { "core/debugLifecycle.ts": { kind: "blocklist", allowedSpecifiers: [] } },
        },
      ],
    });

    expect(result.problems).toContain(
      `"${STAGE_4C}" policy for "core/debugLifecycle.ts" must have kind "exact-import-allowlist"`,
    );
    expect(result.coverage).toEqual([]);
  });

  it("rejects an extensionless policy key, which would match no source file", () => {
    const result = compile({
      policyRegistries: [{ name: STAGE_4C, policies: policiesOf({ "core/debugLifecycle": [] }) }],
    });

    expect(result.problems).toContain(
      `"${STAGE_4C}" key "core/debugLifecycle" must carry a .ts/.tsx extension`,
    );
    expect(result.coverage).toEqual([]);
  });

  it("rejects a duplicated allowed specifier", () => {
    const result = compile({
      policyRegistries: [
        {
          name: STAGE_4C,
          policies: policiesOf({ "core/debugLifecycle.ts": ["core/GameState", "core/GameState"] }),
        },
      ],
    });

    expect(result.problems).toContain(
      `"${STAGE_4C}" policy for "core/debugLifecycle.ts" allows "core/GameState" twice`,
    );
    expect(result.coverage).toEqual([]);
  });

  it("rejects a malformed allowedSpecifiers list", () => {
    expectNoCoverage(
      compile({
        policyRegistries: [
          {
            name: STAGE_4C,
            policies: { "core/debugLifecycle.ts": { kind: "exact-import-allowlist" } },
          },
        ],
      }),
    );
    expectNoCoverage(
      compile({
        policyRegistries: [
          { name: STAGE_4C, policies: policiesOf({ "core/debugLifecycle.ts": [""] }) },
        ],
      }),
    );
  });

  it("rejects a malformed source-file list", () => {
    expectNoCoverage(compile({ sourceFiles: "nope" }));
    expectNoCoverage(compile({ sourceFiles: ["core/debugLifecycle.ts", ""] }));
    expectNoCoverage(compile({ sourceFiles: ["core/README.md"] }));
    expectNoCoverage(
      compile({ sourceFiles: ["core/debugLifecycle.ts", "core/debugLifecycle.ts"] }),
    );
  });

  it("does not validate allowlist ordering", () => {
    // Deliberate: this validator runs over ALL canonical registries, and every list in the real
    // PHASE_HANDLER_IMPORT_POLICIES is unsorted. Enforcing order would reject a valid
    // configuration. Sortedness is a reviewability preference, not part of the guarantee.
    const { problems, coverage } = compile({
      policyRegistries: [
        {
          name: STAGE_4C,
          policies: policiesOf({ "core/debugLifecycle.ts": ["zzz/last", "aaa/first"] }),
        },
      ],
    });

    expect(problems).toEqual([]);
    expect(coverage).toHaveLength(1);
  });
});

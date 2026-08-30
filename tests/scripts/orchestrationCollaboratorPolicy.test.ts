import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  FACADE_KIND_ROLES,
  COLLABORATOR_ROLES,
  validateCollaboratorRegistry,
  compileCollaboratorRegistry,
  compareFacadeImports,
  compareImportSets,
} from "../../scripts/orchestration-collaborator-policy.mjs";

const FACADE = "core/exampleFacade.ts";

type Collaborator = { specifier: string; role: string };

function effectsFacade(collaborators: Collaborator[]) {
  return { [FACADE]: { kind: "effects", collaborators } };
}

/** A minimal valid registry: two neutral contracts, sorted, then an owner. */
function validRegistry() {
  return effectsFacade([
    { specifier: "core/phaseEffectsResult", role: "neutral-contract" },
    { specifier: "core/phases", role: "neutral-contract" },
    { specifier: "core/debugLifecycle", role: "effects-owner" },
  ]);
}

describe("FACADE_KIND_ROLES", () => {
  it("derives COLLABORATOR_ROLES from the matrix without duplicates", () => {
    expect(new Set(COLLABORATOR_ROLES).size).toBe(COLLABORATOR_ROLES.length);
    for (const roles of Object.values(FACADE_KIND_ROLES) as string[][]) {
      for (const role of roles) expect(COLLABORATOR_ROLES).toContain(role);
    }
  });
});

describe("compileCollaboratorRegistry — valid registry", () => {
  it("produces one exact-import-allowlist per facade, in registry order", () => {
    expect(compileCollaboratorRegistry(validRegistry())).toEqual({
      problems: [],
      policies: {
        [FACADE]: {
          kind: "exact-import-allowlist",
          allowedSpecifiers: [
            "core/phaseEffectsResult",
            "core/phases",
            "core/debugLifecycle",
          ],
        },
      },
    });
  });

  it("accepts an empty registry", () => {
    expect(compileCollaboratorRegistry({})).toEqual({ problems: [], policies: {} });
  });
});

describe("compileCollaboratorRegistry — invalid registry", () => {
  // The load-bearing half: a broken registry must never yield a partial allowlist that the
  // checker would then treat as a satisfied boundary.
  const invalid: [string, unknown, RegExp][] = [
    [
      "unknown facade kind",
      { [FACADE]: { kind: "routing", collaborators: [] } },
      /unknown facade kind "routing"/,
    ],
    [
      "unknown role",
      effectsFacade([{ specifier: "core/phases", role: "helper" }]),
      /unknown collaborator role "helper"/,
    ],
    [
      "role not permitted for this facade kind",
      effectsFacade([{ specifier: "core/GameState", role: "authoritative-state-reader" }]),
      /role "authoritative-state-reader" is not permitted for a "effects" facade/,
    ],
    [
      "duplicate specifier",
      effectsFacade([
        { specifier: "core/phases", role: "neutral-contract" },
        { specifier: "core/phases", role: "neutral-contract" },
      ]),
      /duplicate collaborator specifier "core\/phases"/,
    ],
    [
      "self-import without extension",
      effectsFacade([{ specifier: "core/exampleFacade", role: "neutral-contract" }]),
      /may not register itself/,
    ],
    [
      "self-import with extension",
      effectsFacade([{ specifier: FACADE, role: "neutral-contract" }]),
      /may not register itself/,
    ],
    ["empty facade path", { "": { kind: "effects", collaborators: [] } }, /empty facade file path/],
    [
      "empty specifier",
      effectsFacade([{ specifier: "   ", role: "neutral-contract" }]),
      /empty or non-string specifier/,
    ],
    [
      "empty role",
      effectsFacade([{ specifier: "core/phases", role: "" }]),
      /empty or non-string role/,
    ],
    [
      "non-string specifier",
      { [FACADE]: { kind: "effects", collaborators: [{ specifier: 7, role: "neutral-contract" }] } },
      /empty or non-string specifier/,
    ],
    [
      "collaborators is not an array",
      { [FACADE]: { kind: "effects", collaborators: "core/phases" } },
      /collaborators must be an array/,
    ],
    ["entry is not an object", { [FACADE]: "effects" }, /registry entry must be an object/],
    [
      "unrecognised entry field",
      { [FACADE]: { kind: "effects", collaborators: [], reason: "because" } },
      /registry entry has an unrecognised field "reason"/,
    ],
    [
      "unrecognised collaborator field",
      effectsFacade([
        { specifier: "core/phases", role: "neutral-contract", note: "x" } as Collaborator,
      ]),
      /collaborator has an unrecognised field "note"/,
    ],
    [
      "collaborators out of role-group order",
      effectsFacade([
        { specifier: "core/debugLifecycle", role: "effects-owner" },
        { specifier: "core/phases", role: "neutral-contract" },
      ]),
      /breaks role grouping/,
    ],
    [
      "unsorted within one role group",
      effectsFacade([
        { specifier: "core/phases", role: "neutral-contract" },
        { specifier: "core/phaseEffectsResult", role: "neutral-contract" },
      ]),
      /must be sorted before "core\/phases" within the neutral-contract group/,
    ],
  ];

  it.each(invalid)("reports %s and yields no policies", (_label, registry, pattern) => {
    const { problems, policies } = compileCollaboratorRegistry(registry);

    expect(problems.some((problem: string) => pattern.test(problem))).toBe(true);
    expect(policies).toEqual({});
  });
});

describe("validateCollaboratorRegistry — total over malformed input", () => {
  // Ordering validation must never be the thing that crashes on bad data: it runs after
  // shape validation and only sees entries already proven well-formed.
  it.each([[null], ["core/phases"], [["core/phases"]], [undefined]])(
    "reports a structured problem for collaborator %s instead of throwing",
    (collaborator: unknown) => {
      const registry = { [FACADE]: { kind: "effects", collaborators: [collaborator] } };

      expect(() => validateCollaboratorRegistry(registry)).not.toThrow();
      expect(validateCollaboratorRegistry(registry)).toContain(
        `${FACADE}: collaborator must be an object`,
      );
    },
  );

  it("reports both a malformed collaborator and a genuine ordering mistake", () => {
    const problems = validateCollaboratorRegistry(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        [FACADE]: {
          kind: "effects",
          collaborators: [
            null,
            { specifier: "core/debugLifecycle", role: "effects-owner" },
            { specifier: "core/phases", role: "neutral-contract" },
          ],
        },
      } as never,
    );

    expect(problems).toContain(`${FACADE}: collaborator must be an object`);
    expect(problems.some((problem: string) => /breaks role grouping/.test(problem))).toBe(true);
  });

  it("skips ordering for a collaborator whose role is not permitted for the kind", () => {
    // The role violation is the finding; a second, derivative ordering complaint about the
    // same entry would just be noise.
    const problems = validateCollaboratorRegistry(
      effectsFacade([
        { specifier: "core/GameState", role: "authoritative-state-reader" },
        { specifier: "core/phases", role: "neutral-contract" },
      ]),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/is not permitted for a "effects" facade/);
  });

  it("throws only when handed something that is not a registry at all", () => {
    expect(() => validateCollaboratorRegistry(null)).toThrow(/must be an object/);
    expect(() => validateCollaboratorRegistry([])).toThrow(/must be an object/);
  });
});

describe("compareFacadeImports", () => {
  const registry = validRegistry();
  const registered = ["core/phaseEffectsResult", "core/phases", "core/debugLifecycle"];

  it("reports an import that is not registered", () => {
    expect(
      compareFacadeImports({
        facadeKey: FACADE,
        discoveredSpecifiers: [...registered, "core/GameState"],
        registry,
      }),
    ).toEqual({ unregistered: ["core/GameState"], stale: [] });
  });

  it("reports a registered collaborator that is no longer imported", () => {
    expect(
      compareFacadeImports({
        facadeKey: FACADE,
        discoveredSpecifiers: registered.filter((s) => s !== "core/debugLifecycle"),
        registry,
      }),
    ).toEqual({ unregistered: [], stale: ["core/debugLifecycle"] });
  });

  it("passes on equal sets regardless of source order or repeated imports", () => {
    expect(
      compareFacadeImports({
        facadeKey: FACADE,
        discoveredSpecifiers: [
          "core/debugLifecycle",
          "core/phases",
          "core/phases",
          "core/phaseEffectsResult",
          "core/debugLifecycle",
        ],
        registry,
      }),
    ).toEqual({ unregistered: [], stale: [] });
  });

  it("treats a facade missing from the registry as entirely unregistered", () => {
    expect(
      compareFacadeImports({
        facadeKey: "core/unregisteredFacade.ts",
        discoveredSpecifiers: ["core/phases", "core/phases"],
        registry,
      }),
    ).toEqual({ unregistered: ["core/phases"], stale: [] });
  });
});

/**
 * The generic comparison extracted in Stage 4C. `compareFacadeImports` above and the reverse
 * coverage in scripts/orchestration-collaborator-coverage.mjs both route through this, so the
 * checker and its tests cannot disagree about a single import.
 */
describe("compareImportSets", () => {
  const allowed = ["core/phaseEffectsResult", "core/phases", "core/debugLifecycle"];

  it("passes when the two sets are equal", () => {
    expect(compareImportSets({ discovered: [...allowed], allowed })).toEqual({
      unregistered: [],
      stale: [],
    });
  });

  it("reports unregistered and stale independently, in one pass", () => {
    expect(
      compareImportSets({
        discovered: ["core/phases", "core/GameState", "core/phaseEffectsResult"],
        allowed,
      }),
    ).toEqual({
      // core/debugLifecycle is allowed but no longer imported; core/GameState is the reverse.
      unregistered: ["core/GameState"],
      stale: ["core/debugLifecycle"],
    });
  });

  it("counts a repeated discovered import once", () => {
    expect(
      compareImportSets({
        discovered: ["core/GameState", "core/GameState", "core/GameState"],
        allowed: [],
      }),
    ).toEqual({ unregistered: ["core/GameState"], stale: [] });
  });

  it("orders unregistered by first discovery and stale by policy order", () => {
    expect(
      compareImportSets({
        discovered: ["zzz/last", "aaa/first", "zzz/last"],
        allowed: ["mmm/second", "bbb/first"],
      }),
    ).toEqual({
      unregistered: ["zzz/last", "aaa/first"],
      stale: ["mmm/second", "bbb/first"],
    });
  });

  it("reports every discovered import when nothing is allowed", () => {
    expect(compareImportSets({ discovered: ["a", "b"], allowed: [] })).toEqual({
      unregistered: ["a", "b"],
      stale: [],
    });
  });

  it("reports every allowed specifier as stale when nothing is discovered", () => {
    expect(compareImportSets({ discovered: [], allowed: ["a", "b"] })).toEqual({
      unregistered: [],
      stale: ["a", "b"],
    });
  });
});

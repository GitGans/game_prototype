import { readFileSync, readdirSync, statSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  validateRestrictedImportTargets,
  compileRestrictedImportTargets,
  resolveRestrictedTarget,
  evaluateObservedImport,
  findStaleImporterPermissions,
} from "../../scripts/restricted-import-targets.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { RESTRICTED_IMPORT_TARGETS } from "../../scripts/orchestration-boundary-rules.mjs";
// The real sources are read with the SAME scanner and normalization the checker uses. A
// test-local re-implementation of either could disagree with production about a single import
// and turn this suite into false confidence.
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findImports } from "../../scripts/import-scanner.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { normalizeSpecifier } from "../../scripts/import-specifier.mjs";

const VALID = {
  "core/battleRuntimeStorage": {
    reason: "Internal battle-runtime storage cell.",
    allowedImporters: [
      "core/battleRuntimeAccess.ts",
      "core/battleRuntimeWriteAccess.ts",
    ],
  },
};

const compile = (registry: unknown) => compileRestrictedImportTargets(registry);

describe("RESTRICTED_IMPORT_TARGETS registry", () => {
  it("pins the exact registry", () => {
    expect(RESTRICTED_IMPORT_TARGETS).toEqual({
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
    });
  });

  it("compiles the production registry cleanly", () => {
    const { problems, targets } = compile(RESTRICTED_IMPORT_TARGETS);
    expect(problems).toEqual([]);
    expect(Object.keys(targets).sort()).toEqual([
      "core/battleRuntimeStorage",
      "core/battleRuntimeWriteAccess",
    ]);
  });
});

describe("evaluateObservedImport", () => {
  const { targets } = compile(RESTRICTED_IMPORT_TARGETS);

  const evaluate = (importerKey: string, normalizedSpecifier: string) =>
    evaluateObservedImport({ importerKey, normalizedSpecifier, targets });

  it("allows storage from both gateways and nothing else", () => {
    expect(evaluate("core/battleRuntimeAccess.ts", "core/battleRuntimeStorage")).toBeNull();
    expect(evaluate("core/battleRuntimeWriteAccess.ts", "core/battleRuntimeStorage")).toBeNull();
  });

  it("allows the write capability from battlePhaseEffects only", () => {
    expect(evaluate("core/battlePhaseEffects.ts", "core/battleRuntimeWriteAccess")).toBeNull();
  });

  // These are the modules that could most plausibly reach for the runtime "just to read it" or
  // "just to clear it" — each is one review away from re-opening the boundary Stage 4B closed.
  const REJECTED_IMPORTERS = [
    "core/PhaseManager.ts",
    "core/phaseActionEffects.ts",
    "core/phaseSnapshotRebuilder.ts",
    "core/phaseHandlers/worldPhaseHandler.ts",
    "core/phaseTransitionMetadata.ts",
    "scenes/Battle.ts",
    "scenes/controllers/BattleInputController.ts",
  ];

  it.each(REJECTED_IMPORTERS)("rejects storage imported by %s", (importerKey: string) => {
    expect(evaluate(importerKey, "core/battleRuntimeStorage")).toEqual({
      target: "core/battleRuntimeStorage",
      reason: "Internal battle-runtime storage cell.",
    });
  });

  it.each(REJECTED_IMPORTERS)(
    "rejects the write capability imported by %s",
    (importerKey: string) => {
      expect(evaluate(importerKey, "core/battleRuntimeWriteAccess")).toEqual({
        target: "core/battleRuntimeWriteAccess",
        reason: "Battle-runtime write capability owned by battlePhaseEffects.",
      });
    },
  );

  it("even rejects the read gateway taking the WRITE capability", () => {
    // Holding both would collapse the capability split back into one module.
    expect(evaluate("core/battleRuntimeAccess.ts", "core/battleRuntimeWriteAccess")).not.toBeNull();
  });

  it("ignores unrestricted specifiers", () => {
    expect(evaluate("core/PhaseManager.ts", "core/phases")).toBeNull();
  });

  it("matches a target exactly, never by path prefix", () => {
    // A submodule is a different module with its own surface; inheriting a restriction nobody
    // reviewed for it would be a rule applied by accident.
    const { targets: t } = compile(RESTRICTED_IMPORT_TARGETS);
    expect(resolveRestrictedTarget("core/battleRuntimeStorageExtra", t)).toBeNull();
    expect(resolveRestrictedTarget("core/battleRuntimeStorage/inner", t)).toBeNull();
    expect(resolveRestrictedTarget("core/battleRuntimeStorage", t)).toBe(
      "core/battleRuntimeStorage",
    );
  });
});

describe("findStaleImporterPermissions", () => {
  it("reports a registered importer that no longer imports its target", () => {
    const { targets } = compile(VALID);

    expect(
      findStaleImporterPermissions({
        targets,
        observedEdges: [
          {
            importerKey: "core/battleRuntimeAccess.ts",
            normalizedSpecifier: "core/battleRuntimeStorage",
          },
        ],
      }),
    ).toEqual([
      { target: "core/battleRuntimeStorage", importer: "core/battleRuntimeWriteAccess.ts" },
    ]);
  });

  it("reports nothing when every registered importer still imports", () => {
    const { targets } = compile(VALID);

    expect(
      findStaleImporterPermissions({
        targets,
        observedEdges: [
          {
            importerKey: "core/battleRuntimeAccess.ts",
            normalizedSpecifier: "core/battleRuntimeStorage",
          },
          {
            importerKey: "core/battleRuntimeWriteAccess.ts",
            normalizedSpecifier: "core/battleRuntimeStorage",
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("real-source inbound scan", () => {
  /**
   * The production registry evaluated against the ACTUAL src/** import graph, with the same
   * scanner and normalization the checker uses. This is what fails the day someone adds an
   * import of storage or the write capability from a new module — the configuration tests
   * above stay green in that case.
   */
  const SRC = new URL("../../src/", import.meta.url).pathname;
  const { targets } = compile(RESTRICTED_IMPORT_TARGETS);

  const observedEdges: Array<{ importerKey: string; normalizedSpecifier: string }> = [];
  const violations: Array<{ importerKey: string; target: string }> = [];

  for (const importerKey of listSourceFiles(SRC)) {
    const importerFile = `${SRC}${importerKey}`;

    for (const { spec } of findImports(readFileSync(importerFile, "utf8"))) {
      const normalizedSpecifier = normalizeSpecifier({
        srcRoot: SRC,
        importerFile,
        specifier: spec,
      });
      observedEdges.push({ importerKey, normalizedSpecifier });

      const violation = evaluateObservedImport({ importerKey, normalizedSpecifier, targets });
      if (violation !== null) violations.push({ importerKey, target: violation.target });
    }
  }

  it("has no unauthorized importer anywhere in src/", () => {
    expect(violations).toEqual([]);
  });

  it("has no stale importer permission", () => {
    expect(findStaleImporterPermissions({ targets, observedEdges })).toEqual([]);
  });

  it("actually observed the registered importers (the scan is not vacuous)", () => {
    // Without this, a scan that silently walked zero files would satisfy both tests above.
    expect(
      observedEdges.some(
        (edge) =>
          edge.importerKey === "core/battlePhaseEffects.ts" &&
          edge.normalizedSpecifier === "core/battleRuntimeWriteAccess",
      ),
    ).toBe(true);
  });
});

describe("validateRestrictedImportTargets fails closed", () => {
  /**
   * Structural validity must be established BEFORE any content check.
   *
   * The non-string rows are a regression guard, not paranoia: default `Array.prototype.sort()`
   * string-coerces its elements, so a `Symbol()` (or an object with a throwing `toString`)
   * surviving into the ordering check throws a TypeError out of the VALIDATOR and terminates
   * the checker — on exactly the malformed configuration this function exists to turn into a
   * diagnostic. The same applies to `.trim()`, the extension regex, and interpolating an
   * unvalidated element into a message.
   */
  const throwingToString = {
    toString() {
      throw new Error("hostile toString");
    },
  };

  const MALFORMED: Array<[string, unknown]> = [
    ["target key carries .ts", { "core/battleRuntimeStorage.ts": VALID["core/battleRuntimeStorage"] }],
    ["target key carries .tsx", { "core/battleRuntimeStorage.tsx": VALID["core/battleRuntimeStorage"] }],
    ["registry is not an object", ["core/battleRuntimeStorage"]],
    ["registry is null", null],
    ["entry is not an object", { "core/x": "nope" }],
    ["unknown entry field", { "core/x": { reason: "r", allowedImporters: ["a.ts"], extra: 1 } }],
    ["missing reason", { "core/x": { allowedImporters: ["a.ts"] } }],
    ["empty reason", { "core/x": { reason: "   ", allowedImporters: ["a.ts"] } }],
    ["non-string reason", { "core/x": { reason: 7, allowedImporters: ["a.ts"] } }],
    ["allowedImporters missing", { "core/x": { reason: "r" } }],
    ["allowedImporters not an array", { "core/x": { reason: "r", allowedImporters: "a.ts" } }],
    ["allowedImporters empty", { "core/x": { reason: "r", allowedImporters: [] } }],
    ["importer is null", { "core/x": { reason: "r", allowedImporters: [null] } }],
    ["importer is an object", { "core/x": { reason: "r", allowedImporters: [{}] } }],
    ["importer has a throwing toString", { "core/x": { reason: "r", allowedImporters: [throwingToString] } }],
    ["importer is a Symbol", { "core/x": { reason: "r", allowedImporters: [Symbol("a.ts")] } }],
    ["importer is an empty string", { "core/x": { reason: "r", allowedImporters: [""] } }],
    ["importer is whitespace", { "core/x": { reason: "r", allowedImporters: ["   "] } }],
    ["importer lacks an extension", { "core/x": { reason: "r", allowedImporters: ["core/a"] } }],
    ["duplicate importer", { "core/x": { reason: "r", allowedImporters: ["core/a.ts", "core/a.ts"] } }],
    ["unsorted importers", { "core/x": { reason: "r", allowedImporters: ["core/b.ts", "core/a.ts"] } }],
    ["self-registration", { "core/x": { reason: "r", allowedImporters: ["core/x.ts"] } }],
  ];

  it.each(MALFORMED)("%s → diagnostics, never a throw, never a partial policy", (_label, registry) => {
    expect(() => validateRestrictedImportTargets(registry)).not.toThrow();
    expect(validateRestrictedImportTargets(registry).length).toBeGreaterThan(0);

    const { problems, targets } = compile(registry);
    expect(problems.length).toBeGreaterThan(0);
    expect(targets).toEqual({});
  });

  it("names the offending key when it carries an extension", () => {
    // The mistake must be LOUD. A silently non-matching key is a restricted target that stops
    // being restricted — the one failure mode here that fails OPEN.
    const problems = validateRestrictedImportTargets({
      "core/battleRuntimeStorage.ts": VALID["core/battleRuntimeStorage"],
    });
    expect(problems.join("\n")).toMatch(
      /core\/battleRuntimeStorage\.ts: target keys .* must not carry a \.ts\/\.tsx extension/,
    );
  });

  it("names the offending INDEX and typeof for a non-string importer, never its value", () => {
    const problems = validateRestrictedImportTargets({
      "core/x": { reason: "r", allowedImporters: ["core/a.ts", Symbol("b")] },
    });
    expect(problems.join("\n")).toContain("allowedImporters[1] must be a non-empty string");
    expect(problems.join("\n")).toContain("(received symbol)");
  });

  it("disables the ENTIRE compilation when one entry of several is invalid", () => {
    const registry = {
      ...VALID,
      "core/battleRuntimeWriteAccess": { reason: "", allowedImporters: ["core/a.ts"] },
    };

    const { problems, targets } = compile(registry);
    expect(problems.length).toBeGreaterThan(0);
    expect(targets).toEqual({});

    // …and the still-valid entry enforces nothing, so the checker reports the registry problem
    // rather than a scan that falsely passes against half a rule.
    expect(
      evaluateObservedImport({
        importerKey: "core/PhaseManager.ts",
        normalizedSpecifier: "core/battleRuntimeStorage",
        targets,
      }),
    ).toBeNull();
  });
});

/** Recursively lists src-relative .ts/.tsx paths, mirroring the checker's own file walk. */
function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`);
      else if (/\.tsx?$/.test(entry)) out.push(`${prefix}${entry}`);
    }
  };
  walk(root.replace(/\/$/, ""), "");
  return out;
}

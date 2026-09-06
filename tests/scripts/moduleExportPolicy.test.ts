import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  compileModuleExportPolicies,
  evaluateModuleExportPolicy,
  validateModuleExportPolicies,
} from "../../scripts/module-export-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  RESTRICTED_IMPORT_TARGETS,
  BATTLE_RUNTIME_RESTRICTED_TARGETS,
  CONSUME_CONFIRMATION_RESTRICTED_TARGETS,
  STATE_STORE_FORWARDING_TARGETS,
  RUNTIME_OWNERSHIP_EXPORT_COMPILATION,
  RUNTIME_OWNERSHIP_EXPORT_COVERAGE,
  RUNTIME_OWNERSHIP_EXPORT_POLICIES,
} from "../../scripts/orchestration-boundary-rules.mjs";

type ExportEntry = { name: string; kind: string };

/** The approved surface every synthetic fixture is measured against. */
const APPROVED: ExportEntry[] = [
  { name: "approvedFunction", kind: "function" },
  { name: "ApprovedType", kind: "type-alias" },
];

const APPROVED_SOURCE = [
  "export function approvedFunction(): void {}",
  "export type ApprovedType = string;",
].join("\n");

const evaluate = (sourceText: string, expectedExports: unknown = APPROVED): string[] =>
  evaluateModuleExportPolicy({
    sourceText,
    fileName: "fixture.ts",
    expectedExports,
  }) as string[];

/** Adds one violation on top of the complete approved surface, isolating a single diagnostic. */
const plus = (extra: string) => `${APPROVED_SOURCE}\n${extra}`;

// ─────────────────────────────────────────────────────────────────────────────
// Real sources — THE test of this policy. Everything below is a unit case over
// synthetic source; these are what fail the day someone re-exports a capability.
// ─────────────────────────────────────────────────────────────────────────────

describe("runtime-ownership export surfaces against the real sources", () => {
  it.each(Object.entries(RUNTIME_OWNERSHIP_EXPORT_POLICIES) as [string, ExportEntry[]][])(
    "src/%s matches its registered surface exactly",
    (fileKey, expectedExports) => {
      const file = new URL(`../../src/${fileKey}`, import.meta.url).pathname;
      const problems = evaluateModuleExportPolicy({
        sourceText: readFileSync(file, "utf8"),
        fileName: fileKey,
        expectedExports,
      });
      expect(problems).toEqual([]);
    },
  );

  it("finds real exports in each protected module (not vacuously passing on an empty read)", () => {
    for (const [fileKey, expectedExports] of Object.entries(
      RUNTIME_OWNERSHIP_EXPORT_POLICIES,
    ) as [string, ExportEntry[]][]) {
      const file = new URL(`../../src/${fileKey}`, import.meta.url).pathname;
      // An empty registry must report every real export as unregistered. Zero diagnostics here
      // would mean the file parsed to no exports at all — the vacuous pass this guards against.
      const problems = evaluateModuleExportPolicy({
        sourceText: readFileSync(file, "utf8"),
        fileName: fileKey,
        expectedExports: [],
      }) as string[];
      expect(problems).toHaveLength(expectedExports.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Configuration pinning
// ─────────────────────────────────────────────────────────────────────────────

describe("RUNTIME_OWNERSHIP_EXPORT_POLICIES configuration", () => {
  /** Pins the exact reviewed surfaces: any expansion or removal is a visible test change. */
  it("registers exactly the runtime-ownership modules and their surfaces", () => {
    expect(RUNTIME_OWNERSHIP_EXPORT_POLICIES).toEqual({
      // The pending-confirmation triad: same closed-surface guarantee as the battle-runtime
      // triad, so the write capability cannot be forwarded onward under another name.
      "core/consumeConfirmationStorage.ts": [
        { name: "clearConsumeConfirmationSlot", kind: "function" },
        { name: "readConsumeConfirmationSlot", kind: "function" },
        { name: "writeConsumeConfirmationSlot", kind: "function" },
      ],
      "core/consumeConfirmationAccess.ts": [
        { name: "readPendingConsumeForPhase", kind: "function" },
      ],
      "core/consumeConfirmationWriteAccess.ts": [
        { name: "clearPendingConsume", kind: "function" },
        { name: "setPendingConsume", kind: "function" },
      ],
      "core/phaseHandlers/consumablePhaseHandler.ts": [
        { name: "ConsumablePhaseAction", kind: "type-alias" },
        { name: "applyConsumablePhaseAction", kind: "function" },
        { name: "clearConsumeConfirmationIfPresent", kind: "function" },
        { name: "openConsumeConfirmation", kind: "function" },
        { name: "teardownConsumeConfirmationAfterTransition", kind: "function" },
      ],
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
    });
  });

  it("compiles without problems", () => {
    expect(RUNTIME_OWNERSHIP_EXPORT_COMPILATION.problems).toEqual([]);
    expect(RUNTIME_OWNERSHIP_EXPORT_COMPILATION.policies).toBe(RUNTIME_OWNERSHIP_EXPORT_POLICIES);
  });

  /**
   * The closure argument, stated as an assertion: the modules that must be pinned are exactly
   * the BATTLE-RUNTIME restricted targets plus their permitted importers, and that derived set is
   * exactly what the registry covers. A new battle-runtime capability cannot exist with an
   * unpinned surface.
   *
   * Derived from BATTLE_RUNTIME_RESTRICTED_TARGETS, not from the whole registry — see the next
   * test for the other half of the closure.
   */
  it("covers exactly the modules holding restricted runtime authority", () => {
    expect(RUNTIME_OWNERSHIP_EXPORT_COVERAGE).toEqual(
      Object.keys(RUNTIME_OWNERSHIP_EXPORT_POLICIES).sort(),
    );
    // Derived, never hand-listed: both restricted-capability groups (battle runtime and pending
    // confirmation) must have every target AND every permitted importer pinned, so a new
    // capability cannot ship with one direction open.
    const capabilityGroups = {
      ...BATTLE_RUNTIME_RESTRICTED_TARGETS,
      ...CONSUME_CONFIRMATION_RESTRICTED_TARGETS,
    };
    expect(RUNTIME_OWNERSHIP_EXPORT_COVERAGE).toEqual([
      ...new Set([
        ...Object.keys(capabilityGroups).map((target: string) => `${target}.ts`),
        ...Object.values(capabilityGroups).flatMap(
          (entry) => (entry as { allowedImporters: string[] }).allowedImporters,
        ),
      ]),
    ].sort());
  });

  /**
   * The other half: every restricted target NOT covered here is covered by the direct-forwarding
   * scan instead, so no restricted capability is left with both directions open. The state stores
   * cannot use a pinned surface at all — both export a `const`, a kind SUPPORTED_KINDS omits — so
   * this is a genuine split of mechanism, not an exemption.
   */
  it("leaves no restricted target without a forwarding protection", () => {
    const pinned = new Set(
      [
        ...Object.keys(BATTLE_RUNTIME_RESTRICTED_TARGETS),
        ...Object.keys(CONSUME_CONFIRMATION_RESTRICTED_TARGETS),
      ].map((target: string) => `${target}.ts`),
    );
    const forwardingScanned = new Set(STATE_STORE_FORWARDING_TARGETS as string[]);

    for (const target of Object.keys(RESTRICTED_IMPORT_TARGETS)) {
      expect(pinned.has(`${target}.ts`) || forwardingScanned.has(target)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The evaluator: accepted surface
// ─────────────────────────────────────────────────────────────────────────────

describe("module export policy accepts the approved surface", () => {
  it("accepts exactly the registered functions and type aliases", () => {
    expect(evaluate(APPROVED_SOURCE)).toEqual([]);
  });

  it("ignores non-exported declarations", () => {
    const source = plus(
      [
        "function localHelper(): void {}",
        "type LocalAlias = number;",
        "const localValue = 1;",
        "import { something } from './module';",
      ].join("\n"),
    );
    expect(evaluate(source)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The evaluator: two-way parity
// ─────────────────────────────────────────────────────────────────────────────

describe("module export policy pins the surface in both directions", () => {
  it("rejects an additional exported function", () => {
    const problems = evaluate(plus("export function extra(): void {}"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('unregistered export "extra" (function)');
  });

  it("reports a stale registered export rather than leaving a dormant permission", () => {
    const problems = evaluate(APPROVED_SOURCE, [
      ...APPROVED,
      { name: "goneAway", kind: "function" },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('stale RUNTIME_OWNERSHIP_EXPORT_POLICIES entry "goneAway"');
  });

  /**
   * The regression case for the original gap. `battleRuntimeAccess` may legitimately import
   * `battleRuntimeStorage`, so the importer policy does not object — only the export surface
   * closes this path.
   */
  it("rejects a named re-export of a restricted capability", () => {
    const problems = evaluate(
      plus("export { writeBattleRuntimeSlot } from './battleRuntimeStorage';"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("export declaration");
  });

  /**
   * The sharpest form: the forwarded capability wears an APPROVED name. Two diagnostics are
   * correct and both are wanted — a rejected export FORM is never recorded as a discovered
   * name, so the approved name is simultaneously reported as missing.
   */
  it("rejects an aliased re-export wearing an approved public name", () => {
    const problems = evaluate(
      [
        "export { writeBattleRuntimeSlot as approvedFunction } from './battleRuntimeStorage';",
        "export type ApprovedType = string;",
      ].join("\n"),
    );
    expect(problems).toHaveLength(2);
    expect(problems.some((problem) => problem.includes("export declaration"))).toBe(true);
    expect(
      problems.some((problem) =>
        problem.includes('stale RUNTIME_OWNERSHIP_EXPORT_POLICIES entry "approvedFunction"'),
      ),
    ).toBe(true);
  });

  it("rejects `export *`", () => {
    const problems = evaluate(plus("export * from './battleRuntimeStorage';"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("export declaration");
  });

  it("rejects a local export list forwarding an imported capability", () => {
    const problems = evaluate(
      plus(
        [
          "import { writeBattleRuntimeSlot } from './battleRuntimeStorage';",
          "export { writeBattleRuntimeSlot };",
        ].join("\n"),
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("export declaration");
  });

  /**
   * A well-formed wrapper is an approvable FORM — it is the name check, not the form check,
   * that catches it. Both halves of the policy are load-bearing.
   */
  it("rejects an exported wrapper around a restricted capability", () => {
    const problems = evaluate(
      plus(
        "export function forwardBattleRuntimeWrite(next: unknown): void " +
          "{ writeBattleRuntimeSlot(next); }",
      ),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('unregistered export "forwardBattleRuntimeWrite" (function)');
  });

  it("rejects a duplicate exported name", () => {
    const problems = evaluate(plus("export function approvedFunction(): void {}"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('duplicate exported name "approvedFunction"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The evaluator: declaration kinds and unsupported forms
// ─────────────────────────────────────────────────────────────────────────────

describe("module export policy pins declaration kinds", () => {
  /**
   * A registered TYPE reappearing as a runtime value is a new capability, not a rename. The
   * fixture must be an approvable form with the wrong kind — an exported `const` is rejected as
   * an unsupported form and never reaches the kind comparison (see the unsupported-forms case).
   */
  it("rejects an approved type export becoming a runtime value", () => {
    const problems = evaluate(
      [
        "export function approvedFunction(): void {}",
        "export function ApprovedType(): void {}",
      ].join("\n"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      'export "ApprovedType" is a function, registered as type-alias',
    );
  });

  it.each([
    ["variable", "export const forward = writeBattleRuntimeSlot;"],
    ["class", "export class Forwarder {}"],
    ["interface", "export interface Forwarded { a: string }"],
    ["enum", "export enum Forwarded { A }"],
    ["namespace", "export namespace Forwarded { export const a = 1; }"],
    ["ambient function", "export declare function forwarded(): void;"],
  ])("rejects an exported %s", (_form, declaration) => {
    const problems = evaluate(plus(declaration));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("unsupported exported");
  });

  it("rejects a default export in both syntactic forms", () => {
    for (const declaration of [
      "export default function forwarded(): void {}",
      "export default writeBattleRuntimeSlot;",
    ]) {
      const problems = evaluate(plus(declaration));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("default export");
    }
  });

  it("rejects `export =`", () => {
    const problems = evaluate(plus("export = writeBattleRuntimeSlot;"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`export =`");
  });

  /**
   * `export as namespace Foo;` is a top-level export form carrying NO export modifier, so it
   * would slip past a modifier-only scan and leave the surface not actually closed.
   */
  it("rejects `export as namespace`", () => {
    const problems = evaluate(plus("export as namespace Runtime;"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("`export as namespace`");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The evaluator fails closed
// ─────────────────────────────────────────────────────────────────────────────

describe("module export policy fails closed", () => {
  /**
   * createSourceFile's parser is error-tolerant: a broken file yields a truncated statement
   * list, which would otherwise read as "no exports" and produce only stale-entry noise.
   */
  it("reports parse errors instead of passing vacuously", () => {
    const problems = evaluate("export function broken( {");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.includes("parse error"))).toBe(true);
    expect(problems.some((problem) => problem.includes("stale"))).toBe(false);
  });

  it("reports an empty module as fully stale rather than clean", () => {
    const problems = evaluate("");
    expect(problems).toHaveLength(APPROVED.length);
    expect(problems.every((problem) => problem.includes("stale"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry validation
// ─────────────────────────────────────────────────────────────────────────────

describe("module export policy registry validation", () => {
  const validate = (registry: unknown, required: string[] = []): string[] =>
    validateModuleExportPolicies(registry, required) as string[];

  const VALID = { "core/battleRuntimeStorage.ts": [{ name: "a", kind: "function" }] };

  it("accepts a well-formed registry", () => {
    expect(validate(VALID)).toEqual([]);
  });

  it.each([
    ["a non-object registry", null, "must be a plain object"],
    ["an array registry", [], "must be a plain object"],
  ])("rejects %s", (_label, registry, expected) => {
    expect(validate(registry)[0]).toContain(expected);
  });

  /** An extensionless key would match no file and silently stop pinning anything. */
  it("rejects an extensionless key", () => {
    const problems = validate({ "core/battleRuntimeStorage": [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("must carry a .ts/.tsx extension");
  });

  it("rejects a non-array entry list", () => {
    const problems = validate({ "core/a.ts": { name: "a" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("must be an array of { name, kind } entries");
  });

  it("rejects a non-object entry", () => {
    const problems = validate({ "core/a.ts": ["a"] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("entry 0 must be an object");
  });

  it("rejects an unknown entry field", () => {
    const problems = validate({
      "core/a.ts": [{ name: "a", kind: "function", allowed: true }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('unknown field "allowed"');
  });

  it("rejects an empty name", () => {
    const problems = validate({ "core/a.ts": [{ name: "  ", kind: "function" }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("needs a non-empty name");
  });

  /** Reported by typeof only — an unvalidated value must never be interpolated. */
  it("rejects an unsupported kind without interpolating the value", () => {
    const problems = validate({ "core/a.ts": [{ name: "a", kind: Symbol("x") }] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("has unsupported kind (symbol)");
  });

  /** The reason entries are an array: an object map would deduplicate this silently. */
  it("rejects a duplicate registered name", () => {
    const problems = validate({
      "core/a.ts": [
        { name: "a", kind: "function" },
        { name: "a", kind: "type-alias" },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('registers "a" twice');
  });

  it("rejects a module holding restricted authority with no reviewed surface", () => {
    const problems = validate(VALID, [
      "core/battleRuntimeStorage.ts",
      "core/battleRuntimeWriteAccess.ts",
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      '"core/battleRuntimeWriteAccess.ts" holds restricted battle-runtime authority but has no ' +
        "reviewed export surface",
    );
  });

  it("compiles to an empty policy set whenever any problem exists", () => {
    const { problems, policies } = compileModuleExportPolicies({ "core/a": [] });
    expect(problems.length).toBeGreaterThan(0);
    expect(policies).toEqual({});
  });
});

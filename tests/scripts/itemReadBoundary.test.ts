// The consumable read/write direction, pinned against the policy the checker actually enforces.
//
// These tests verify the DECLARED policy and the matching behaviour; running
// `node scripts/check-boundaries.mjs` verifies its application to the repository. The rule is a
// DIRECT-IMPORT restriction on one module — the checker performs no transitive dependency
// analysis, and nothing here should be read as if it did.
//
// Fixtures are in memory: no production file is modified, renamed or restored at any point.

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { matchesPathPrefix } from "../../scripts/boundary-policy.mjs";
// The checker's own scanner and normalizer: a test-local re-implementation of either could
// disagree with production about a single import form and turn this suite into false confidence.
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findImports } from "../../scripts/import-scanner.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { normalizeSpecifier } from "../../scripts/import-specifier.mjs";

const SRC = new URL("../../src/", import.meta.url).pathname;
const CHECKER = new URL("../../scripts/check-boundaries.mjs", import.meta.url).pathname;

const READ_MODEL_KEY = "core/itemUsability.ts";
const EXECUTOR_KEY = "core/itemUse.ts";

// Explicitly typed so TypeScript treats every call as never-returning and narrows afterwards.
const fail: (what: string) => never = (what) => {
  throw new Error(
    `Could not read ${what} from scripts/check-boundaries.mjs. The PURE_CORE_FILES shape this ` +
      `test depends on has changed; update the extractor rather than deleting the assertions.`,
  );
};

/**
 * True when `entry.file` is exactly `join(SRC, "core", "<fileName>")`.
 *
 * The whole expression is validated, not just its string arguments: `join(OTHER_ROOT, "core",
 * "itemUsability.ts")` collects the same literals but targets a different file, and
 * accepting it would let this suite pin a policy that protects something else while reporting
 * that the read model is covered.
 */
function targetsCoreFile(entry: ts.ObjectLiteralExpression, fileName: string): boolean {
  const property = entry.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "file",
  );
  if (property === undefined || !ts.isCallExpression(property.initializer)) return false;

  const call = property.initializer;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "join") return false;
  if (call.arguments.length !== 3) return false;

  const [root, dir, name] = call.arguments;
  if (root === undefined || !ts.isIdentifier(root) || root.text !== "SRC") return false;
  if (dir === undefined || !ts.isStringLiteral(dir) || dir.text !== "core") return false;

  return name !== undefined && ts.isStringLiteral(name) && name.text === fileName;
}

/**
 * The real `banned` list the checker enforces for one PURE_CORE_FILES entry, addressed by its
 * src-relative key ("core/<name>.ts" — both modules under test live in core/).
 */
function extractBannedList(fileKey: string): string[] {
  const [dir, fileName, ...rest] = fileKey.split("/");
  if (dir !== "core" || fileName === undefined || rest.length > 0) {
    fail(`an unsupported entry key "${fileKey}" (this extractor addresses core/<name>.ts only)`);
  }

  const source = ts.createSourceFile(
    "check-boundaries.mjs",
    readFileSync(CHECKER, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((d) => ts.isIdentifier(d.name) && d.name.text === "PURE_CORE_FILES");

  if (declaration === undefined) fail("the PURE_CORE_FILES declaration");
  if (
    declaration.initializer === undefined ||
    !ts.isArrayLiteralExpression(declaration.initializer)
  ) {
    fail("the PURE_CORE_FILES array literal");
  }

  const entries = declaration.initializer.elements.filter(ts.isObjectLiteralExpression);

  // Exactly one entry, matched on the complete `join(SRC, "core", "<name>")` expression.
  const matches = entries.filter((candidate) => targetsCoreFile(candidate, fileName));
  const [entry] = matches;
  if (matches.length !== 1 || entry === undefined) {
    fail(`exactly one PURE_CORE_FILES entry for ${fileKey} (found ${matches.length})`);
  }

  const banned = entry.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "banned",
  );
  if (banned === undefined || !ts.isArrayLiteralExpression(banned.initializer)) {
    fail(`the banned list of ${fileKey}`);
  }

  const values = banned.initializer.elements;
  if (!values.every(ts.isStringLiteral)) fail(`a non-literal banned entry in ${fileKey}`);

  return values.map((literal) => (literal as ts.StringLiteral).text);
}

/** Applies a real banned list to synthetic source, the same way the checker's loop does. */
function bannedImportsIn(fileKey: string, banned: readonly string[], source: string) {
  const importerFile = `${SRC}${fileKey}`;

  return [...findImports(source)].flatMap(({ spec }: { spec: string }) => {
    const normalized = normalizeSpecifier({ srcRoot: SRC, importerFile, specifier: spec });
    return banned
      .filter((entry) => matchesPathPrefix(normalized, entry))
      .map((entry) => ({ spec, entry }));
  });
}

describe("itemUsability PURE_CORE policy (extracted from the real checker)", () => {
  const banned = extractBannedList(READ_MODEL_KEY);

  it("bans the executor", () => {
    expect(banned).toContain("core/itemUse");
  });

  it("keeps the restrictions that were already in force", () => {
    // Named explicitly, not derived from the list under test: an entry deleted alongside a
    // future edit must fail here rather than pass by iterating over whatever remains.
    for (const entry of [
      "core/GameState",
      "core/DebugBattleState",
      "core/playerSessionStore",
      "core/itemInteractionStorage",
      "core/itemInteractionAccess",
      "core/itemInteractionWriteAccess",
      "core/battleRuntimeAccess",
      "core/battleRuntimeContext",
      "core/PhaseManager",
      "core/phaseActionEffects",
      "scenes",
      "objects",
      "ui",
      "phaser",
    ]) {
      expect(banned, entry).toContain(entry);
    }
  });

  // Every dependency form scripts/import-scanner.mjs recognises. A rule that caught only the
  // plain form would be bypassable by a re-export or a side-effect import.
  it.each([
    ["value import", `import { useItem } from './itemUse';`],
    ["type-only import", `import type { ConsumableUseResult } from './itemUse';`],
    ["re-export", `export { useItem } from './itemUse';`],
    ["side-effect import", `import './itemUse';`],
    ["literal dynamic import", `const m = await import('./itemUse');`],
    ["parent-relative specifier", `import { x } from '../core/itemUse';`],
  ])("rejects the reverse edge — %s", (_label, source) => {
    expect(bannedImportsIn(READ_MODEL_KEY, banned, source)).toEqual([
      { spec: expect.any(String), entry: "core/itemUse" },
    ]);
  });

  it("accepts the real itemUsability.ts source", () => {
    const source = readFileSync(`${SRC}${READ_MODEL_KEY}`, "utf8");
    expect(bannedImportsIn(READ_MODEL_KEY, banned, source)).toEqual([]);
  });

  it("does not match the read model through a shared textual prefix", () => {
    // 'core/itemUse' is a textual prefix of 'core/itemUsability' but not a
    // path-segment prefix. If that ever inverted, the new ban would take the read model down.
    expect(matchesPathPrefix("core/itemUsability", "core/itemUse")).toBe(false);
    expect(matchesPathPrefix("core/itemUse", "core/itemUse")).toBe(true);
  });
});

describe("the permitted direction stays open", () => {
  const banned = extractBannedList(EXECUTOR_KEY);

  it("lets the executor import the read model", () => {
    expect(banned).not.toContain("core/itemUsability");
    expect(
      bannedImportsIn(
        EXECUTOR_KEY,
        banned,
        `import { evaluateItemUse } from './itemUsability';`,
      ),
    ).toEqual([]);
  });

  it("accepts the real itemUse.ts source", () => {
    const source = readFileSync(`${SRC}${EXECUTOR_KEY}`, "utf8");
    expect(bannedImportsIn(EXECUTOR_KEY, banned, source)).toEqual([]);
  });
});

/**
 * The same read/write split, one layer down, for the BATTLE item modules.
 *
 * It is enforced differently — by `battlePhaseSnapshot`'s exact-import allowlist rather than a
 * `PURE_CORE_FILES` ban — because the snapshot builder is a registered orchestration
 * collaborator, and an exact allowlist rejects anything unlisted without enumerating it. The
 * guarantee is the same: a projection can ask "is this enabled?" and cannot change anything.
 */
describe("battle item evaluator/executor split", () => {
  const SNAPSHOT_KEY = "core/battlePhaseSnapshot.ts";

  it("registers the evaluator for the snapshot builder, and NOT the executor", async () => {
    const { ORCHESTRATION_COLLABORATOR_IMPORT_POLICIES } = await import(
      // @ts-expect-error — plain .mjs tooling module, intentionally untyped
      "../../scripts/orchestration-boundary-rules.mjs"
    );
    const policy = ORCHESTRATION_COLLABORATOR_IMPORT_POLICIES[SNAPSHOT_KEY];

    expect(policy.allowedSpecifiers).toContain("battle/itemUsability");
    expect(policy.allowedSpecifiers).not.toContain("battle/itemUse");
  });

  it("the real snapshot builder imports the evaluator and never the executor", () => {
    const importerFile = `${SRC}${SNAPSHOT_KEY}`;
    const specifiers = [...findImports(readFileSync(importerFile, "utf8"))].map(
      ({ spec }: { spec: string }) =>
        normalizeSpecifier({ srcRoot: SRC, importerFile, specifier: spec }),
    );

    expect(specifiers).toContain("battle/itemUsability");
    expect(specifiers).not.toContain("battle/itemUse");
  });

  it("the executor may import the evaluator — the permitted direction", () => {
    const importerFile = `${SRC}battle/itemUse.ts`;
    const specifiers = [...findImports(readFileSync(importerFile, "utf8"))].map(
      ({ spec }: { spec: string }) =>
        normalizeSpecifier({ srcRoot: SRC, importerFile, specifier: spec }),
    );

    expect(specifiers).toContain("battle/itemUsability");
  });

  it("does not match the evaluator through a shared textual prefix", () => {
    // 'battle/itemUse' is a textual prefix of 'battle/itemUsability' but not a path-segment
    // prefix — the same trap the core pair has.
    expect(matchesPathPrefix("battle/itemUsability", "battle/itemUse")).toBe(false);
  });
});

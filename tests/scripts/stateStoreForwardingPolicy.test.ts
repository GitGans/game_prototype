import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { evaluateStateStoreForwarding } from "../../scripts/state-store-forwarding-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { STATE_STORE_RESTRICTED_TARGETS } from "../../scripts/orchestration-boundary-rules.mjs";
// The real sources are read with the SAME scanner and normalization the checker uses, for the same
// reason as in restrictedImportTargets.test.ts: a test-local re-implementation could disagree with
// production about one specifier and turn this suite into false confidence.
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findImports } from "../../scripts/import-scanner.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { normalizeSpecifier } from "../../scripts/import-specifier.mjs";

const SRC = new URL("../../src/", import.meta.url).pathname;

/** Synthetic fixtures name the stores directly, so specifier matching needs no path resolution. */
const isRestrictedSpecifier = (specifier: string): boolean =>
  /(^|\/)(GameState|playerSessionStore)$/.test(specifier);

const evaluate = (sourceText: string): string[] =>
  evaluateStateStoreForwarding({
    sourceText,
    fileName: "fixture.ts",
    isRestrictedSpecifier,
  }) as string[];

// ─────────────────────────────────────────────────────────────────────────────
// Rejected: the direct forwarding forms
// ─────────────────────────────────────────────────────────────────────────────

describe("direct forwarding of a restricted state store", () => {
  const FORWARDING: Array<[string, string]> = [
    ["source-level re-export", `export { GameState } from './GameState';`],
    ["wildcard re-export", `export * from './GameState';`],
    ["namespace re-export", `export * as Store from '../playerSessionStore';`],
    [
      "export list over a locally imported binding",
      `import { GameState } from './GameState';\nexport { GameState };`,
    ],
    [
      "aliased export of a locally imported binding",
      `import { GameState } from './GameState';\nexport { GameState as State };`,
    ],
    [
      "export list over an aliased import",
      `import { PlayerSessionStore as S } from './playerSessionStore';\nexport { S };`,
    ],
    [
      "namespace import forwarded",
      `import * as Store from './GameState';\nexport { Store };`,
    ],
    [
      "default export of a store binding",
      `import { GameState } from './GameState';\nexport default GameState;`,
    ],
    [
      "exported alias",
      `import { GameState } from './GameState';\nexport const State = GameState;`,
    ],
  ];

  it.each(FORWARDING)("rejects %s", (_label: string, sourceText: string) => {
    expect(evaluate(sourceText).length).toBeGreaterThan(0);
  });

  // scripts/import-scanner.mjs already counts `import('x')` as a dependency, so the INBOUND
  // allowlist catches an unapproved module using one. This closes the other half: an APPROVED
  // owner forwarding the resolved module object binds no local name, so no statement-level scan
  // would ever see it. The nested case pins that the walk covers the whole tree.
  const DYNAMIC: Array<[string, string]> = [
    ["an exported promise", `export const stateModule = import('./GameState');`],
    [
      "a nested dynamic import with no export at all",
      `async function load() { return import('./GameState'); }`,
    ],
    [
      "a dynamic import inside a call argument",
      `void Promise.all([import('../playerSessionStore')]);`,
    ],
  ];

  it.each(DYNAMIC)("rejects a dynamic store import as %s", (_label: string, sourceText: string) => {
    expect(evaluate(sourceText).join("\n")).toMatch(/dynamic import of a restricted state store/);
  });

  it("reports problems in source order across both passes", () => {
    const problems = evaluate(
      [
        `import { GameState } from './GameState';`,
        `export const State = GameState;`,
        `export const later = import('./GameState');`,
      ].join("\n"),
    );

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^line 2: exported alias/);
    expect(problems[1]).toMatch(/^line 3: dynamic import/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Allowed: ordinary use of a store behind a purpose-built operation
// ─────────────────────────────────────────────────────────────────────────────

describe("ordinary store consumers", () => {
  const ALLOWED: Array<[string, string]> = [
    [
      "a lifecycle function that writes through the store",
      `import { GameState } from './GameState';
       export function initializeNewCampaign(): void {
         GameState.setCampaignState(buildCampaign());
       }`,
    ],
    [
      "a snapshot function returning purpose-built data",
      `import { PlayerSessionStore } from './playerSessionStore';
       export function rebuild(phase: GamePhase): GamePhase {
         return { ...phase, roster: PlayerSessionStore.getSession(phase.sessionSource).roster };
       }`,
    ],
    [
      "an exported alias of something that is not a store binding",
      `import { GameState } from './GameState';
       const local = 1;
       export const alias = local;`,
    ],
    ["a re-export from an unrestricted module", `export type { Foo } from './fooContract';`],
    ["a dynamic import of an unrestricted module", `export const m = import('./fooContract');`],
    ["a side-effect import, which binds nothing", `import './GameState';`],
  ];

  it.each(ALLOWED)("allows %s", (_label: string, sourceText: string) => {
    expect(evaluate(sourceText)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail-closed
// ─────────────────────────────────────────────────────────────────────────────

describe("fails closed", () => {
  it("reports a parse error rather than reading a broken file as clean", () => {
    const problems = evaluate(`export { from`);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toMatch(/parse error/);
  });

  it("never throws on an empty source", () => {
    expect(() => evaluate("")).not.toThrow();
    expect(evaluate("")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The real sources
// ─────────────────────────────────────────────────────────────────────────────

describe("real-source sweep", () => {
  // Every module currently permitted to hold a store. This is the regression guard proving the
  // policy does not fire on the existing architecture — the reason it can be adopted without
  // moving a single state operation.
  const OWNERS: string[] = [
    ...new Set(
      Object.values(STATE_STORE_RESTRICTED_TARGETS).flatMap(
        (entry: { allowedImporters: string[] }) => entry.allowedImporters,
      ),
    ),
  ].sort();

  it("covers every registered owner (the sweep is not vacuous)", () => {
    // 12 since itemUsePhaseHandler joined playerSessionStore's permitted importers.
    expect(OWNERS.length).toBe(12);
  });

  it.each(OWNERS)("%s forwards nothing", (fileKey: string) => {
    const importerFile = `${SRC}${fileKey}`;
    const sourceText = readFileSync(importerFile, "utf8");

    const problems = evaluateStateStoreForwarding({
      sourceText,
      fileName: fileKey,
      // The checker's own normalization, so './GameState' from core/ and '../GameState' from
      // core/phaseHandlers/ are both resolved exactly as production resolves them.
      isRestrictedSpecifier: (specifier: string) =>
        Object.hasOwn(
          STATE_STORE_RESTRICTED_TARGETS,
          normalizeSpecifier({ srcRoot: SRC, importerFile, specifier }),
        ),
    }) as string[];

    expect(problems).toEqual([]);
  });

  it("each registered owner really does import a store", () => {
    // Guards the sweep above against a file that stopped importing a store: it would then pass
    // vacuously while the stale-permission check in the inbound scan is what actually catches it.
    for (const fileKey of OWNERS) {
      const importerFile = `${SRC}${fileKey}`;
      const specifiers = [...findImports(readFileSync(importerFile, "utf8"))].map(
        ({ spec }: { spec: string }) =>
          normalizeSpecifier({ srcRoot: SRC, importerFile, specifier: spec }),
      );

      expect(
        specifiers.some((specifier: string) =>
          Object.hasOwn(STATE_STORE_RESTRICTED_TARGETS, specifier),
        ),
      ).toBe(true);
    }
  });
});

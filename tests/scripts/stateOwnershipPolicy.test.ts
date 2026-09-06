import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { evaluateStateOwnershipPolicy } from "../../scripts/state-ownership-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findClassMembers } from "../../scripts/ts-class-members.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  GAME_STATE_FIELDS,
  GAME_STATE_PUBLIC_API,
} from "../../scripts/orchestration-boundary-rules.mjs";

const GAME_STATE_FILE = new URL("../../src/core/GameState.ts", import.meta.url).pathname;

const evaluate = (sourceText: string, overrides: Record<string, unknown> = {}) =>
  evaluateStateOwnershipPolicy({
    sourceText,
    className: "GameStateManager",
    fileName: "GameState.ts",
    allowedFields: GAME_STATE_FIELDS,
    allowedPublicApi: GAME_STATE_PUBLIC_API,
    ...overrides,
  });

/** A minimal stand-in for the real class, used to isolate one violation at a time. */
function fakeGameState(body: string): string {
  return `class GameStateManager {\n${body}\n}\nexport const GameState = new GameStateManager();`;
}

const MINIMAL_BODY = [
  "  private campaignState = null;",
  "  private debugState = null;",
  ...GAME_STATE_PUBLIC_API.map((name: string) => `  ${name}() { return null; }`),
].join("\n");

describe("GameState ownership policy against the real source", () => {
  /**
   * THE test of this policy. Everything else here is a unit case over a synthetic source;
   * this is the one that fails the day someone adds a field or a method to the real class,
   * which is the entire point of pinning both surfaces.
   */
  it("matches src/core/GameState.ts exactly, in both dimensions", () => {
    expect(evaluate(readFileSync(GAME_STATE_FILE, "utf8"))).toEqual([]);
  });

  it("finds the real class (the check is not vacuously passing on an absent class)", () => {
    const { found } = findClassMembers(readFileSync(GAME_STATE_FILE, "utf8"), {
      className: "GameStateManager",
      fileName: "GameState.ts",
    });
    expect(found).toBe(true);
  });
});

describe("GameState ownership policy fails closed", () => {
  it("reports a missing class rather than silently passing", () => {
    const problems = evaluate("export const GameState = {};");
    expect(problems).toEqual([
      "class GameStateManager not found — state-ownership policy cannot be enforced",
    ]);
  });

  it("rejects a re-added battleRuntime field", () => {
    const problems = evaluate(fakeGameState(`  private battleRuntime = null;\n${MINIMAL_BODY}`));
    expect(problems.join("\n")).toContain(
      'unregistered GameStateManager field "battleRuntime" — add it to GAME_STATE_FIELDS',
    );
  });

  it("rejects a public accessor backed by module-local storage", () => {
    /**
     * The case a FIELD registry alone cannot see: the runtime lives outside the class, so no
     * field is declared, yet the capability is fully exposed again. This is why both surfaces
     * are pinned rather than only the stored fields.
     */
    const source =
      "let moduleLocal = null;\n" +
      fakeGameState(`${MINIMAL_BODY}\n  getBattleRuntime() { return moduleLocal; }`);

    expect(evaluate(source).join("\n")).toContain(
      'unregistered GameStateManager public member "getBattleRuntime"',
    );
  });

  it.each(["get", "set"])("rejects an undeclared public %ster", (accessor: string) => {
    const member =
      accessor === "get"
        ? "  get battleRuntime() { return null; }"
        : "  set battleRuntime(v) {}";

    expect(evaluate(fakeGameState(`${MINIMAL_BODY}\n${member}`)).join("\n")).toContain(
      'unregistered GameStateManager public member "battleRuntime"',
    );
  });

  it("rejects a registered state field that has become public", () => {
    // A public container field exports the whole tree, not merely a method over it — and its
    // NAME is registered, so the name diff alone would let it through.
    const body = MINIMAL_BODY.replace("private campaignState", "campaignState");
    expect(evaluate(fakeGameState(body)).join("\n")).toContain(
      'state field "campaignState" must stay private/protected',
    );
  });

  it("rejects an unregistered constructor parameter property", () => {
    // A parameter property is a field declaration in different syntax; a checker that missed
    // it would be bypassable in one line.
    const source = fakeGameState(
      `${MINIMAL_BODY}\n  constructor(private readonly battleRuntime: unknown) {}`,
    );
    expect(evaluate(source).join("\n")).toContain(
      'unregistered GameStateManager field "battleRuntime"',
    );
  });

  it("allows a plain constructor parameter, which declares no member", () => {
    const source = fakeGameState(`${MINIMAL_BODY}\n  constructor(deps: unknown) {}`);
    expect(evaluate(source)).toEqual([]);
  });

  it("rejects an index signature outright", () => {
    // `[key: string]: unknown` widens the surface to everything while exposing no named
    // member, so no name allowlist can bound it.
    const source = fakeGameState(`${MINIMAL_BODY}\n  [key: string]: unknown;`);
    expect(evaluate(source).join("\n")).toContain("index signature — an allowlist cannot bound it");
  });

  it("rejects a computed member name", () => {
    const source =
      "const KEY = 'battleRuntime';\n" + fakeGameState(`${MINIMAL_BODY}\n  [KEY]() { return null; }`);
    expect(evaluate(source).join("\n")).toContain("computed member — an allowlist cannot bound it");
  });

  it("rejects an ECMA-private member, which the field registry cannot see", () => {
    const source = fakeGameState(`${MINIMAL_BODY}\n  #battleRuntime = null;`);
    expect(evaluate(source).join("\n")).toContain(
      "ECMA-private member — use the private modifier",
    );
  });

  it("rejects a stale registration in either dimension", () => {
    const problems = evaluate(fakeGameState(MINIMAL_BODY), {
      allowedFields: [...GAME_STATE_FIELDS, "removedField"],
      allowedPublicApi: [...GAME_STATE_PUBLIC_API, "removedMethod"],
    }).join("\n");

    // A dormant permission is how a deleted member returns without review — the same two-way
    // parity argument as the collaborator registry.
    expect(problems).toContain('stale GAME_STATE_FIELDS entry "removedField"');
    expect(problems).toContain('stale GAME_STATE_PUBLIC_API entry "removedMethod"');
  });

  it("reports a public field once, as a field, not twice", () => {
    // Public FIELDS are covered by the field registry; counting them as public API too would
    // print one declaration as two violations.
    const source = fakeGameState(`${MINIMAL_BODY}\n  battleRuntime = null;`);
    const problems = evaluate(source).filter((p: string) => p.includes("battleRuntime"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("field");
  });

  it("ignores private helpers, which expose no capability", () => {
    const source = fakeGameState(`${MINIMAL_BODY}\n  private helper() { return null; }`);
    expect(evaluate(source)).toEqual([]);
  });
});

describe("findClassMembers", () => {
  it("classifies each member form", () => {
    const { found, members } = findClassMembers(
      [
        "class C {",
        "  private a = 1;",
        "  static b = 2;",
        "  m() {}",
        "  get g() { return 1; }",
        "  set s(v) {}",
        "  [key: string]: unknown;",
        "  #p = 3;",
        "  constructor(private readonly dep: unknown, plain: unknown) {}",
        "}",
      ].join("\n"),
      { className: "C" },
    );

    expect(found).toBe(true);
    expect(members.map((m: { form: string }) => m.form)).toEqual([
      "field",
      "field",
      "method",
      "getter",
      "setter",
      "index-signature",
      "field",
      "constructor",
      "parameter-property",
    ]);

    // `plain` carries no modifier, declares no member, and is absent above.
    const names = members.map((m: { name: { name?: string } }) => m.name.name);
    expect(names).not.toContain("plain");
    expect(names).toContain("dep");
  });

  it("reports found: false for an absent class", () => {
    expect(findClassMembers("class Other {}", { className: "C" })).toEqual({
      found: false,
      members: [],
    });
  });
});

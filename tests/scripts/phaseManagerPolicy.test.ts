import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  findPhaseManagerTypeDiscriminatorReads,
  findPhaseManagerPublicApiViolations,
  evaluatePhaseManagerPolicy,
} from "../../scripts/phase-manager-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { PHASE_MANAGER_PUBLIC_API } from "../../scripts/orchestration-boundary-rules.mjs";

describe("PhaseManager discriminator policy", () => {
  it.each([
    ["dot access", "function f(action: any) { return action.type; }"],
    ["optional dot access", "function f(phase: any) { return phase?.type; }"],
    ["bracket access", 'function f(action: any) { return action["type"]; }'],
    [
      "destructuring",
      "function f(action: any) { const { type } = action; return type; }",
    ],
    [
      "renamed destructuring",
      "function f(action: any) { const { type: actionType } = action; return actionType; }",
    ],
  ])("rejects %s", (_name, source) => {
    expect(findPhaseManagerTypeDiscriminatorReads(source)).not.toEqual([]);
  });

  it("allows a coordinator that does not inspect discriminators", () => {
    const source = `
      function transition(previous: unknown, action: unknown) {
        return { previous, action };
      }
    `;

    expect(findPhaseManagerTypeDiscriminatorReads(source)).toEqual([]);
  });
});

describe("PhaseManager public API policy", () => {
  const wrap = (body: string) => `class PhaseManagerClass {\n${body}\n}`;
  const API = ["init", "getPhase", "transition"];

  it.each([
    ["an undeclared method", "refreshSnapshot(): void {}"],
    ["an explicitly public method", "public resetRngStreams(): void {}"],
    ["a public field", "lastResult: unknown = null;"],
    ["a getter", "get debugState(): unknown { return null; }"],
    ["a setter", "set debugState(v: unknown) {}"],
    ["a static member", "static create(): void {}"],
    ["a static field", "static shared: unknown = null;"],
    ["a public constructor parameter property", "constructor(public deps: unknown) {}"],
    ["a readonly constructor parameter property", "constructor(readonly deps: unknown) {}"],
    ["a computed member", "[Symbol.iterator](): void {}"],
    // An index signature exposes no NAMED member while widening the surface to everything —
    // ignoring it would make the allowlist trivially bypassable.
    ["a public index signature", "[key: string]: unknown;"],
  ])("rejects %s", (_name, body) => {
    expect(findPhaseManagerPublicApiViolations(wrap(body), API)).not.toEqual([]);
  });

  it.each([
    [
      "the allowlisted methods",
      "init(s: unknown): void {} getPhase(): unknown { return null; } transition(a: unknown): unknown { return null; }",
    ],
    [
      "the private dependency parameter property",
      "constructor(private readonly dependencies: unknown) {}",
    ],
    ["a plain constructor parameter", "constructor(dependencies: unknown) {}"],
    ["private members", "private phase: unknown = null; private helper(): void {}"],
    ["protected members", "protected phase: unknown = null; protected helper(): void {}"],
    ["ECMAScript private members", "#phase: unknown = null; #helper(): void {}"],
    ["a protected index signature", "protected [key: string]: unknown;"],
    ["a private index signature", "private [key: string]: unknown;"],
  ])("accepts %s", (_name, body) => {
    expect(findPhaseManagerPublicApiViolations(wrap(body), API)).toEqual([]);
  });

  it("fails closed when PhaseManagerClass is missing", () => {
    expect(findPhaseManagerPublicApiViolations("export const x = 1;", API)).not.toEqual([]);
  });
});

describe("evaluatePhaseManagerPolicy", () => {
  // This is what guarantees the public-API rule is part of what check-boundaries.mjs calls:
  // the checker invokes this one function, so both scans reach it or neither does.
  it("reports discriminator reads and public-API violations together", () => {
    const source = `class PhaseManagerClass {
      transition(action: any) { return action.type; }
      refreshSnapshot(): void {}
    }`;

    const rules = evaluatePhaseManagerPolicy({
      sourceText: source,
      allowedPublicMembers: PHASE_MANAGER_PUBLIC_API,
    }).map((violation: { rule: string }) => violation.rule);

    expect(rules).toContain("PhaseManager coordinator");
    expect(rules).toContain("PhaseManager public API");
  });

  it("passes a compliant coordinator", () => {
    const source = `class PhaseManagerClass {
      private phase: unknown = null;
      constructor(private readonly dependencies: unknown) {}
      init(s: unknown): void {}
      getPhase(): unknown { return this.phase; }
      transition(a: unknown): unknown { return a; }
    }`;

    expect(
      evaluatePhaseManagerPolicy({
        sourceText: source,
        allowedPublicMembers: PHASE_MANAGER_PUBLIC_API,
      }),
    ).toEqual([]);
  });
});

/**
 * Source/config drift protection — NOT checker-wiring verification. A green result here means
 * the scanner parses the real file and the allowlist matches its current members; it cannot
 * prove that check-boundaries.mjs calls the scanner at all.
 */
describe("PHASE_MANAGER_PUBLIC_API against the real source", () => {
  const source = readFileSync(
    new URL("../../src/core/PhaseManager.ts", import.meta.url),
    "utf8",
  );

  it("declares no public member outside the allowlist", () => {
    expect(findPhaseManagerPublicApiViolations(source, PHASE_MANAGER_PUBLIC_API)).toEqual([]);
  });

  it("has no allowlist entry that no longer exists in the source", () => {
    // With an empty allowlist every public member is reported, so the count is the real
    // public surface size. A stale entry would make the allowlist larger than that.
    expect(findPhaseManagerPublicApiViolations(source, [])).toHaveLength(
      PHASE_MANAGER_PUBLIC_API.length,
    );
  });
});

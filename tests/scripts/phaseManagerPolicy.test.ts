import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findPhaseManagerTypeDiscriminatorReads } from "../../scripts/phase-manager-policy.mjs";

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

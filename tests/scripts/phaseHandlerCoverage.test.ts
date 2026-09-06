import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { checkPhaseHandlerCoverage } from "../../scripts/phase-handler-coverage.mjs";

const HANDLER_A = "core/phaseHandlers/aHandler.ts";
const HANDLER_B = "core/phaseHandlers/bHandler.ts";
const NESTED_HANDLER = "core/phaseHandlers/world/newHandler.ts";

describe("checkPhaseHandlerCoverage", () => {
  it("reports no problems when every discovered handler has exactly one policy", () => {
    expect(
      checkPhaseHandlerCoverage({
        discoveredHandlers: [HANDLER_A, HANDLER_B],
        policies: {
          [HANDLER_A]: { kind: "exact-import-allowlist", allowedSpecifiers: [] },
          [HANDLER_B]: { kind: "exact-import-allowlist", allowedSpecifiers: [] },
        },
        exclusions: [],
      }),
    ).toEqual([]);
  });

  it("flags a handler with neither a policy nor an exclusion", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [HANDLER_A],
      policies: {},
      exclusions: [],
    });
    expect(problems).toEqual([
      `${HANDLER_A} has no import policy and no coverage exclusion`,
    ]);
  });

  it("permits a handler covered by a valid, non-empty-reason exclusion", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [HANDLER_A],
      policies: {},
      exclusions: [{ handler: HANDLER_A, reason: "legacy handler pending removal" }],
    });
    expect(problems).toEqual([]);
  });

  it("flags a handler with both a policy and an exclusion", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [HANDLER_A],
      policies: {
        [HANDLER_A]: { kind: "exact-import-allowlist", allowedSpecifiers: [] },
      },
      exclusions: [{ handler: HANDLER_A, reason: "some reason" }],
    });
    expect(problems).toEqual([
      `${HANDLER_A} has both an import policy and a coverage exclusion`,
    ]);
  });

  it("flags an exclusion with an empty reason", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [HANDLER_A],
      policies: {},
      exclusions: [{ handler: HANDLER_A, reason: "   " }],
    });
    expect(problems).toEqual([`${HANDLER_A} exclusion has no non-empty reason`]);
  });

  it("flags the same handler excluded twice", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [HANDLER_A],
      policies: {},
      exclusions: [
        { handler: HANDLER_A, reason: "first" },
        { handler: HANDLER_A, reason: "second" },
      ],
    });
    expect(problems).toContain(`${HANDLER_A} has 2 duplicate coverage exclusions`);
  });

  it("flags a policy naming a handler that is not present", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [],
      policies: {
        [HANDLER_A]: { kind: "exact-import-allowlist", allowedSpecifiers: [] },
      },
      exclusions: [],
    });
    expect(problems).toEqual([
      `policy for ${HANDLER_A} refers to a handler that is not present`,
    ]);
  });

  it("flags an exclusion naming a handler that is not present", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [],
      policies: {},
      exclusions: [{ handler: HANDLER_A, reason: "some reason" }],
    });
    expect(problems).toEqual([
      `exclusion for ${HANDLER_A} refers to a handler that is not present`,
    ]);
  });

  it("covers a handler discovered at a nested path by its full path, not a reconstructed one", () => {
    const problems = checkPhaseHandlerCoverage({
      discoveredHandlers: [NESTED_HANDLER],
      policies: {
        [NESTED_HANDLER]: { kind: "exact-import-allowlist", allowedSpecifiers: [] },
      },
      exclusions: [],
    });
    expect(problems).toEqual([]);
  });
});

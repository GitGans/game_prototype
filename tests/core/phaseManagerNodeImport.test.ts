import { describe, expect, it } from "vitest";

describe("PhaseManager Node import boundary", () => {
  it("imports without browser globals", async () => {
    await expect(import("../../src/core/PhaseManager")).resolves.toHaveProperty(
      "PhaseManager",
    );
  });
  it("imports phaseTransitionResolver without browser globals", async () => {
    await expect(
      import("../../src/core/phaseTransitionResolver"),
    ).resolves.toHaveProperty("resolveTransition");
  });
});

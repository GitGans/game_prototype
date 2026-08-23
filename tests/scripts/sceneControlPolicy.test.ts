import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  findSceneControlCalls,
  evaluateSceneControlCalls,
} from "../../scripts/scene-control-policy.mjs";
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { SCENE_CONTROL_POLICY } from "../../scripts/orchestration-boundary-rules.mjs";

const BOOT_POLICY = SCENE_CONTROL_POLICY["scenes/Boot.ts"];
const PRELOADER_POLICY = SCENE_CONTROL_POLICY["scenes/Preloader.ts"];
const SYNCHRONIZER_POLICY = SCENE_CONTROL_POLICY["scenes/phaserSceneSynchronizer.ts"];

describe("findSceneControlCalls + evaluateSceneControlCalls", () => {
  it("allows the legal Boot.ts bootstrap call", () => {
    const calls = findSceneControlCalls(
      `this.scene.start("Preloader");`,
      "scenes/Boot.ts",
    );
    expect(evaluateSceneControlCalls(calls, BOOT_POLICY)).toEqual([]);
  });

  it("rejects a Boot.ts call to the wrong target", () => {
    const calls = findSceneControlCalls(`this.scene.start("Game");`, "scenes/Boot.ts");
    const problems = evaluateSceneControlCalls(calls, BOOT_POLICY);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/only start\("Preloader"\) is permitted here/);
  });

  it("rejects a Boot.ts call with a dynamic (non-literal) target", () => {
    const calls = findSceneControlCalls(
      `this.scene.start(dynamicKey);`,
      "scenes/Boot.ts",
    );
    expect(evaluateSceneControlCalls(calls, BOOT_POLICY)).toHaveLength(1);
  });

  it("rejects a second, duplicate Boot.ts bootstrap call", () => {
    const calls = findSceneControlCalls(
      `this.scene.start("Preloader"); this.scene.start("Preloader");`,
      "scenes/Boot.ts",
    );
    const problems = evaluateSceneControlCalls(calls, BOOT_POLICY);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/duplicate call/);
  });

  it("allows the legal Preloader.ts bootstrap call and rejects a wrong target", () => {
    const goodCalls = findSceneControlCalls(
      `this.scene.start("MainMenu");`,
      "scenes/Preloader.ts",
    );
    expect(evaluateSceneControlCalls(goodCalls, PRELOADER_POLICY)).toEqual([]);

    const badCalls = findSceneControlCalls(
      `this.scene.start("Boot");`,
      "scenes/Preloader.ts",
    );
    expect(evaluateSceneControlCalls(badCalls, PRELOADER_POLICY)).toHaveLength(1);
  });

  it("allows phaserSceneSynchronizer.ts to call start/stop with dynamic targets", () => {
    const calls = findSceneControlCalls(
      `this.scene.start(key); this.scene.stop(other);`,
      "scenes/phaserSceneSynchronizer.ts",
    );
    expect(evaluateSceneControlCalls(calls, SYNCHRONIZER_POLICY)).toEqual([]);
  });

  it("rejects scene control in an arbitrary scene not in SCENE_CONTROL_POLICY", () => {
    const calls = findSceneControlCalls(`this.scene.start("X");`, "scenes/WorldMap.ts");
    const problems = evaluateSceneControlCalls(
      calls,
      SCENE_CONTROL_POLICY["scenes/WorldMap.ts"],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toBe("not permitted in this file");
  });

  it("rejects the same call pattern moved outside scenes/", () => {
    const calls = findSceneControlCalls(`this.scene.start("X");`, "objects/Foo.ts");
    const problems = evaluateSceneControlCalls(
      calls,
      SCENE_CONTROL_POLICY["objects/Foo.ts"],
    );
    expect(problems).toHaveLength(1);
  });

  it.each([
    "start",
    "stop",
    "launch",
    "switch",
    "restart",
    "run",
    "sleep",
    "wake",
    "pause",
    "resume",
  ])("detects the %s control verb", (method: string) => {
    const calls = findSceneControlCalls(`this.scene.${method}("X");`, "scenes/Foo.ts");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe(method);
  });

  it("flags start/launch/run given a second data argument", () => {
    const calls = findSceneControlCalls(
      `this.scene.start("X", { data: 1 });`,
      "scenes/phaserSceneSynchronizer.ts",
    );
    const problems = evaluateSceneControlCalls(calls, SYNCHRONIZER_POLICY);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/exactly one scene-key argument/);
  });

  it("flags restart given any argument", () => {
    const calls = findSceneControlCalls(`this.scene.restart("X");`, "scenes/Foo.ts");
    const problems = evaluateSceneControlCalls(calls, { methods: ["restart"] });
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/must not receive any arguments/);
  });

  it("does not detect scene.add / scene.time / scene.scale calls", () => {
    const calls = findSceneControlCalls(
      `
      this.scene.add.text(0, 0, "hi");
      this.scene.time.delayedCall(100, () => {});
      this.scene.scale.on("resize", () => {});
      `,
      "scenes/Foo.ts",
    );
    expect(calls).toEqual([]);
  });

  it("detects a one-level alias of .scene", () => {
    const calls = findSceneControlCalls(
      `const sm = this.game.scene; sm.start(key);`,
      "scenes/phaserSceneSynchronizer.ts",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("start");
  });

  it("does not flag a shadowed alias name in a nested scope", () => {
    const calls = findSceneControlCalls(
      `
      const sm = this.game.scene;
      {
        const sm = anotherObject;
        sm.start();
      }
      `,
      "scenes/phaserSceneSynchronizer.ts",
    );
    expect(calls).toEqual([]);
  });

  it("only flags the alias in the function where .scene was actually assigned", () => {
    const source = `
      function withAlias() {
        const sm = this.game.scene;
        sm.start(key);
      }
      function withoutAlias() {
        const sm = somethingElse;
        sm.start(key);
      }
      `;
    const calls = findSceneControlCalls(source, "scenes/phaserSceneSynchronizer.ts");
    expect(calls).toHaveLength(1);
  });

  it("detects string-literal element access equivalently to dotted access", () => {
    const calls = findSceneControlCalls(
      `this.scene["start"]("Game");`,
      "scenes/Foo.ts",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("start");
    expect(calls[0].literalArg).toBe("Game");
  });

  it("reports the real line number in a multi-line snippet", () => {
    const calls = findSceneControlCalls(
      `
      const a = 1;
      const b = 2;
      this.scene.start("X");
      `,
      "scenes/Foo.ts",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].line).toBe(4);
  });
});

describe("loop / catch / switch shadowing does not leak past the shadowing scope", () => {
  // Each source: an outer `sm` alias, a same-named non-scene local shadowing it
  // inside a `for`/`for...of`/`for...in`/`catch`/unbraced-`switch-case` scope
  // (whose call must be ignored), then a real call through the outer alias
  // after that scope (which must still be detected).
  const cases: Array<[string, string]> = [
    [
      "for",
      `
      const sm = this.game.scene;
      for (let sm = other; ready; ) {
        sm.start("bad");
        break;
      }
      sm.start("Game");
      `,
    ],
    [
      "for...of",
      `
      const sm = this.game.scene;
      for (const sm of items) {
        sm.start("bad");
      }
      sm.start("Game");
      `,
    ],
    [
      "for...in",
      `
      const sm = this.game.scene;
      for (const sm in obj) {
        sm.start("bad");
      }
      sm.start("Game");
      `,
    ],
    [
      "catch",
      `
      const sm = this.game.scene;
      try {
        doSomething();
      } catch (sm) {
        sm.start("bad");
      }
      sm.start("Game");
      `,
    ],
    [
      "switch (unbraced case)",
      `
      const sm = this.game.scene;
      switch (x) {
        case 1:
          let sm = other;
          sm.start("bad");
          break;
      }
      sm.start("Game");
      `,
    ],
  ];

  it.each(cases)(
    "%s: shadowed local is ignored, outer alias call after the scope is still detected",
    (_name: string, source: string) => {
      const calls = findSceneControlCalls(source, "scenes/phaserSceneSynchronizer.ts");
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("start");
      expect(calls[0].literalArg).toBe("Game");
    },
  );
});

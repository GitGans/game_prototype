import { describe, it, expect } from "vitest";
import {
  isAlive,
  isDead,
  killUnit,
  reviveUnit,
  type LifeStateReadable,
} from "../../src/battle/lifeState";
import { makeUnit } from "./helpers/units";
import type { ActiveEffect } from "../../src/shared/activeEffect";

describe("LifeStateReadable structural input", () => {
  it("isDead accepts a structural object without other Unit fields", () => {
    const readable: LifeStateReadable = { hp: 0, lifeState: 'dead' };
    expect(isDead(readable)).toBe(true);
    expect(isAlive(readable)).toBe(false);
  });

  it("isAlive accepts a structural object", () => {
    const readable: LifeStateReadable = { hp: 5, lifeState: 'alive' };
    expect(isAlive(readable)).toBe(true);
    expect(isDead(readable)).toBe(false);
  });
});

describe("isAlive", () => {
  it("true for lifeState 'alive' and hp 1", () => {
    expect(isAlive(makeUnit({ hp: 1, lifeState: 'alive' }))).toBe(true);
  });

  it("true for lifeState 'alive' and hp at maxHp", () => {
    expect(isAlive(makeUnit({ hp: 100, maxHp: 100, lifeState: 'alive' }))).toBe(true);
  });

  it("false for lifeState 'alive' but hp 0", () => {
    expect(isAlive(makeUnit({ hp: 0, lifeState: 'alive' }))).toBe(false);
  });

  it("false for lifeState 'dead' with positive hp", () => {
    expect(isAlive(makeUnit({ hp: 5, lifeState: 'dead' }))).toBe(false);
  });

  it("false for lifeState 'dead' and hp 0", () => {
    expect(isAlive(makeUnit({ hp: 0, lifeState: 'dead' }))).toBe(false);
  });
});

describe("isDead", () => {
  it("true for canonical dead state (lifeState 'dead' and hp 0)", () => {
    expect(isDead(makeUnit({ hp: 0, lifeState: 'dead' }))).toBe(true);
  });

  it("true defensively for lifeState 'alive' with hp 0", () => {
    expect(isDead(makeUnit({ hp: 0, lifeState: 'alive' }))).toBe(true);
  });

  it("true defensively for lifeState 'alive' with negative hp", () => {
    expect(isDead(makeUnit({ hp: -3, lifeState: 'alive' }))).toBe(true);
  });

  it("false for living unit", () => {
    expect(isDead(makeUnit({ hp: 1, lifeState: 'alive' }))).toBe(false);
  });
});

describe("killUnit", () => {
  const dummyEffect = (): ActiveEffect => ({
    effectDisplayName: "test",
    effect:            { id: "e1", effectTone: 'negative' },
    remainingRounds:   2,
  });

  it("returns a new object reference", () => {
    const u = makeUnit({ hp: 50, lifeState: 'alive' });
    expect(killUnit(u)).not.toBe(u);
  });

  it("sets lifeState 'dead'", () => {
    expect(killUnit(makeUnit({ hp: 50, lifeState: 'alive' })).lifeState).toBe('dead');
  });

  it("sets hp to 0", () => {
    expect(killUnit(makeUnit({ hp: 50, lifeState: 'alive' })).hp).toBe(0);
  });

  it("clears activeEffects", () => {
    const u = makeUnit({ hp: 50, lifeState: 'alive', activeEffects: [dummyEffect(), dummyEffect()] });
    expect(killUnit(u).activeEffects).toEqual([]);
  });

  it("leaves other fields untouched", () => {
    const u = makeUnit({
      id: 'u-keep', templateId: 'orc_tank', maxHp: 77,
      hp: 50, lifeState: 'alive',
    });
    const killed = killUnit(u);
    expect(killed.id).toBe('u-keep');
    expect(killed.templateId).toBe('orc_tank');
    expect(killed.maxHp).toBe(77);
  });
});

describe("reviveUnit", () => {
  it("sets lifeState 'alive'", () => {
    const dead = makeUnit({ hp: 0, lifeState: 'dead' });
    expect(reviveUnit(dead, 10).lifeState).toBe('alive');
  });

  it("clamps hp = -10 up to 1", () => {
    const dead = makeUnit({ hp: 0, maxHp: 100, lifeState: 'dead' });
    expect(reviveUnit(dead, -10).hp).toBe(1);
  });

  it("clamps hp = 0 up to 1", () => {
    const dead = makeUnit({ hp: 0, maxHp: 100, lifeState: 'dead' });
    expect(reviveUnit(dead, 0).hp).toBe(1);
  });

  it("clamps hp above maxHp down to maxHp", () => {
    const dead = makeUnit({ hp: 0, maxHp: 80, lifeState: 'dead' });
    expect(reviveUnit(dead, 9999).hp).toBe(80);
  });

  it("passes through valid hp unchanged", () => {
    const dead = makeUnit({ hp: 0, maxHp: 100, lifeState: 'dead' });
    expect(reviveUnit(dead, 42).hp).toBe(42);
  });
});

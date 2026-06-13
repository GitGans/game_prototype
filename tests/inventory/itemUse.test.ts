import { describe, it, expect } from "vitest";
import { useItem } from "../../src/inventory";
import { backpack, instance, def } from "./helpers";

const defs = {
  potion: def("potion", { equipSlot: null, usage: "consume", useEffect: { type: "heal", amount: 20 } }),
  tome: def("tome", { equipSlot: null, usage: "consume", useEffect: { type: "permanent_stat_boost", stat: "hp", amount: 5 } }),
  plain: def("plain", { equipSlot: null, usage: "consume" }), // no useEffect
};

describe("useItem", () => {
  it("consumes the item from containers and instances; input untouched", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "p1" }) };
    const instances = { p1: instance("p1", "potion") };
    const cBefore = structuredClone(containers);
    const iBefore = structuredClone(instances);

    const result = useItem("p1", containers, instances, defs);
    expect(result.ok).toBe(true);
    expect(containers).toEqual(cBefore); // pure
    expect(instances).toEqual(iBefore);
    if (result.ok) {
      expect(result.nextContainers.backpack_shared.slots["0"]).toBeUndefined();
      expect(result.nextInstances.p1).toBeUndefined();
    }
  });

  it("returns the permanent_stat_boost effect WITHOUT applying it (core applies)", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "t1" }) };
    const instances = { t1: instance("t1", "tome") };
    const result = useItem("t1", containers, instances, defs);
    expect(result).toMatchObject({ ok: true, effect: { type: "permanent_stat_boost", stat: "hp", amount: 5 } });
  });

  it("returns the heal effect (core keeps the outside-battle no-op)", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "p1" }) };
    const instances = { p1: instance("p1", "potion") };
    const result = useItem("p1", containers, instances, defs);
    expect(result).toMatchObject({ ok: true, effect: { type: "heal", amount: 20 } });
  });

  it("fails on missing instance / missing use effect", () => {
    expect(useItem("nope", {}, {}, defs)).toEqual({ ok: false, reason: "missing_instance" });
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "x" }) };
    const instances = { x: instance("x", "plain") };
    expect(useItem("x", containers, instances, defs)).toEqual({ ok: false, reason: "missing_use_effect" });
  });
});

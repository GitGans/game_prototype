import { describe, it, expect } from "vitest";
import { getEquippedBonuses } from "../../src/inventory";
import { equipment, instance, def, zeroBonuses } from "./helpers";

const defs = {
  helm: def("helm", { battleStatBonuses: { hp: 10, physicalDefense: 2 } }),
  ring: def("ring", { battleStatBonuses: { magicalStrength: 5 } }),
  boots: def("boots", { battleStatBonuses: { dodge: 3, block: 4, initiative: 1 } }),
};
const insts = {
  i_helm: instance("i_helm", "helm"),
  i_ring: instance("i_ring", "ring"),
  i_boots: instance("i_boots", "boots"),
  i_orphan: instance("i_orphan", "missing_def"),
};

describe("getEquippedBonuses", () => {
  it("returns an all-zero object when there is no equipment container", () => {
    expect(getEquippedBonuses("u1", {}, insts, defs)).toEqual(zeroBonuses);
  });

  it("sums bonuses across equipped items", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm", ring_1: "i_ring" }) };
    expect(getEquippedBonuses("u1", containers, insts, defs)).toEqual({
      hp: 10, physicalStrength: 0, magicalStrength: 5, physicalDefense: 2, magicalDefense: 0,
      dodge: 0, block: 0, initiative: 0,
    });
  });

  it("skips equipped items whose definition is missing", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm", ring_1: "i_orphan" }) };
    expect(getEquippedBonuses("u1", containers, insts, defs)).toEqual({
      hp: 10, physicalStrength: 0, magicalStrength: 0, physicalDefense: 2, magicalDefense: 0,
      dodge: 0, block: 0, initiative: 0,
    });
  });

  it("sums dodge/block/initiative bonuses — previously excluded, now fixed", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm", boots: "i_boots" }) };
    expect(getEquippedBonuses("u1", containers, insts, defs)).toEqual({
      hp: 10, physicalStrength: 0, magicalStrength: 0, physicalDefense: 2, magicalDefense: 0,
      dodge: 3, block: 4, initiative: 1,
    });
  });
});

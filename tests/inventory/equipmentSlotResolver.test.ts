import { describe, it, expect } from "vitest";
import { resolvePreferredEquipSlot, canDefinitionUseEquipmentSlot } from "../../src/inventory";
import { def, equipment } from "./helpers";

describe("resolvePreferredEquipSlot", () => {
  it("returns not_equippable for a consumable (equipSlot null)", () => {
    const result = resolvePreferredEquipSlot(def("tonic", { equipSlot: null }), equipment("u1"));
    expect(result).toEqual({ ok: false, reason: "not_equippable" });
  });

  it("returns the concrete slot for a non-ring item", () => {
    const result = resolvePreferredEquipSlot(def("neck", { equipSlot: "necklace" }), equipment("u1"));
    expect(result).toEqual({ ok: true, slot: "necklace" });
  });

  it("returns ring_1 when both ring slots are free", () => {
    const result = resolvePreferredEquipSlot(def("ring", { equipSlot: "ring" }), equipment("u1"));
    expect(result).toEqual({ ok: true, slot: "ring_1" });
  });

  it("returns ring_2 when ring_1 is occupied", () => {
    const result = resolvePreferredEquipSlot(def("ring", { equipSlot: "ring" }), equipment("u1", { ring_1: "x" }));
    expect(result).toEqual({ ok: true, slot: "ring_2" });
  });

  it("returns no_free_ring_slot when both ring slots are occupied", () => {
    const result = resolvePreferredEquipSlot(def("ring", { equipSlot: "ring" }), equipment("u1", { ring_1: "x", ring_2: "y" }));
    expect(result).toEqual({ ok: false, reason: "no_free_ring_slot" });
  });
});

describe("canDefinitionUseEquipmentSlot", () => {
  const ring = def("ring", { equipSlot: "ring" });
  const neck = def("neck", { equipSlot: "necklace" });
  const tonic = def("tonic", { equipSlot: null });

  it("accepts ring_1 / ring_2 for ring items", () => {
    expect(canDefinitionUseEquipmentSlot(ring, "ring_1")).toBe(true);
    expect(canDefinitionUseEquipmentSlot(ring, "ring_2")).toBe(true);
  });

  it("rejects non-ring slots for ring items", () => {
    expect(canDefinitionUseEquipmentSlot(ring, "necklace")).toBe(false);
    expect(canDefinitionUseEquipmentSlot(ring, "ring")).toBe(false);
  });

  it("accepts the exact slot for non-ring items", () => {
    expect(canDefinitionUseEquipmentSlot(neck, "necklace")).toBe(true);
  });

  it("rejects the wrong slot for non-ring items", () => {
    expect(canDefinitionUseEquipmentSlot(neck, "helmet")).toBe(false);
  });

  it("rejects any slot for a non-equippable item", () => {
    expect(canDefinitionUseEquipmentSlot(tonic, "belt")).toBe(false);
  });
});

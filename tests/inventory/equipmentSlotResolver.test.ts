import { describe, it, expect } from "vitest";
import { resolvePreferredEquipSlot, canMetadataUseEquipmentSlot } from "../../src/inventory";
import { meta, equipment } from "./helpers";

describe("resolvePreferredEquipSlot", () => {
  it("returns not_equippable for a consumable (slot null) — consumables are never equipped", () => {
    const result = resolvePreferredEquipSlot(meta({ kind: "consumable", slot: null }), equipment("u1"));
    expect(result).toEqual({ ok: false, reason: "not_equippable" });
  });

  it("equips a usable item into usable_slot", () => {
    const result = resolvePreferredEquipSlot(meta({ kind: "usable", slot: "usable_slot" }), equipment("u1"));
    expect(result).toEqual({ ok: true, slot: "usable_slot" });
  });

  it("returns the concrete slot for a non-ring item", () => {
    const result = resolvePreferredEquipSlot(meta({ slot: "necklace" }), equipment("u1"));
    expect(result).toEqual({ ok: true, slot: "necklace" });
  });

  it("returns ring_1 when both ring slots are free", () => {
    const result = resolvePreferredEquipSlot(meta({ slot: "ring" }), equipment("u1"));
    expect(result).toEqual({ ok: true, slot: "ring_1" });
  });

  it("returns ring_2 when ring_1 is occupied", () => {
    const result = resolvePreferredEquipSlot(meta({ slot: "ring" }), equipment("u1", { ring_1: "x" }));
    expect(result).toEqual({ ok: true, slot: "ring_2" });
  });

  it("returns no_free_ring_slot when both ring slots are occupied", () => {
    const result = resolvePreferredEquipSlot(meta({ slot: "ring" }), equipment("u1", { ring_1: "x", ring_2: "y" }));
    expect(result).toEqual({ ok: false, reason: "no_free_ring_slot" });
  });
});

describe("canMetadataUseEquipmentSlot", () => {
  const ring = meta({ slot: "ring" });
  const neck = meta({ slot: "necklace" });
  const tonic = meta({ kind: "consumable", slot: null });

  it("accepts ring_1 / ring_2 for ring items", () => {
    expect(canMetadataUseEquipmentSlot(ring, "ring_1")).toBe(true);
    expect(canMetadataUseEquipmentSlot(ring, "ring_2")).toBe(true);
  });

  it("rejects non-ring slots for ring items", () => {
    expect(canMetadataUseEquipmentSlot(ring, "necklace")).toBe(false);
    expect(canMetadataUseEquipmentSlot(ring, "ring")).toBe(false);
  });

  it("accepts the exact slot for non-ring items", () => {
    expect(canMetadataUseEquipmentSlot(neck, "necklace")).toBe(true);
  });

  it("rejects the wrong slot for non-ring items", () => {
    expect(canMetadataUseEquipmentSlot(neck, "helmet")).toBe(false);
  });

  it("rejects any slot for a non-equippable item", () => {
    expect(canMetadataUseEquipmentSlot(tonic, "belt")).toBe(false);
  });
});

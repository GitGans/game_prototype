import { describe, it, expect } from "vitest";
import { getSellPrice } from "../../src/inventory";
import { def } from "./helpers";

describe("getSellPrice", () => {
  it("is floor(buyPrice / 4)", () => {
    expect(getSellPrice(def("a", { buyPrice: 100 }))).toBe(25);
    expect(getSellPrice(def("b", { buyPrice: 10 }))).toBe(2);   // floor(2.5)
    expect(getSellPrice(def("c", { buyPrice: 3 }))).toBe(0);
  });
});

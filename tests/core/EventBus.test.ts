import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/core/EventBus";

describe("EventBus", () => {
  it("invokes the handler with the registered context", () => {
    const context = { value: 42 };
    let observed: unknown;
    function handler(this: typeof context) {
      observed = this.value;
    }

    EventBus.on("test:context", handler, context);
    EventBus.emit("test:context");
    EventBus.off("test:context", handler, context);

    expect(observed).toBe(42);
  });

  it("removes only the exact (handler, context) match", () => {
    const contextA = {};
    const contextB = {};
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    EventBus.on("test:exact-removal", handlerA, contextA);
    EventBus.on("test:exact-removal", handlerB, contextB);
    EventBus.off("test:exact-removal", handlerA, contextA);
    EventBus.emit("test:exact-removal");
    EventBus.off("test:exact-removal", handlerB, contextB);

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it("invokes multiple listeners registered for the same event", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const context = {};

    EventBus.on("test:multiple", handlerA, context);
    EventBus.on("test:multiple", handlerB, context);
    EventBus.emit("test:multiple", "payload");
    EventBus.off("test:multiple", handlerA, context);
    EventBus.off("test:multiple", handlerB, context);

    expect(handlerA).toHaveBeenCalledWith("payload");
    expect(handlerB).toHaveBeenCalledWith("payload");
  });

  it("does not throw when emitting an event with no listeners", () => {
    expect(() => EventBus.emit("test:no-listeners")).not.toThrow();
  });
});

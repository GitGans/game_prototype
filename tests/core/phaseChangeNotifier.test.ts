import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyPhaseChanged } from '../../src/core/phaseChangeNotifier';
import { EventBus, Events } from '../../src/core/EventBus';

// EventBus is a module-level singleton shared by the whole suite — every listener
// registered here must be removed again, or it leaks into unrelated tests.
const listeners: Array<(...args: unknown[]) => void> = [];

function listen(): ReturnType<typeof vi.fn> {
  const handler = vi.fn();
  EventBus.on(Events.STATE_CHANGED, handler);
  listeners.push(handler);
  return handler;
}

afterEach(() => {
  while (listeners.length) {
    EventBus.off(Events.STATE_CHANGED, listeners.pop()!);
  }
});

describe('notifyPhaseChanged', () => {
  it('emits exactly one STATE_CHANGED notification', () => {
    const handler = listen();

    notifyPhaseChanged();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('carries no payload — it is a notification, never a render-data channel', () => {
    const handler = listen();

    notifyPhaseChanged();

    expect(handler).toHaveBeenCalledWith();
  });

  it('emits once per call, to every subscriber', () => {
    const first = listen();
    const second = listen();

    notifyPhaseChanged();
    notifyPhaseChanged();

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('does not emit any other event', () => {
    const other = vi.fn();
    EventBus.on('some_other_event', other);

    notifyPhaseChanged();

    expect(other).not.toHaveBeenCalled();
    EventBus.off('some_other_event', other);
  });
});

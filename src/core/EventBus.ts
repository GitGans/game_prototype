type Handler = (...args: any[]) => void;

interface Listener {
  handler: Handler;
  context: unknown;
}

class SimpleEventEmitter {
  private listeners = new Map<string, Listener[]>();

  on(event: string, handler: Handler, context?: unknown): void {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, context });
    this.listeners.set(event, list);
  }

  off(event: string, handler: Handler, context?: unknown): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(
      event,
      list.filter((l) => l.handler !== handler || l.context !== context),
    );
  }

  emit(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const { handler, context } of [...list]) {
      handler.apply(context, args);
    }
  }
}

/** Singleton event emitter for cross-system communication. */
export const EventBus = new SimpleEventEmitter();

export const Events = {
  STATE_CHANGED: 'battle:state_changed',
} as const;

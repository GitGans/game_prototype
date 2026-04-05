import Phaser from 'phaser';

/** Singleton event emitter for cross-system communication. */
export const EventBus = new Phaser.Events.EventEmitter();

export const Events = {
  STATE_CHANGED: 'battle:state_changed',
} as const;

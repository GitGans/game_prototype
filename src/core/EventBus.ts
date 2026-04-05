import Phaser from 'phaser';

/** Singleton event emitter for cross-system communication. */
export const EventBus = new Phaser.Events.EventEmitter();

export const Events = {
  STATE_CHANGED: 'battle:state_changed',
  UNIT_SELECTED: 'battle:unit_selected',
  TARGETS_READY: 'battle:targets_ready',
  ATTACK_RESOLVED: 'battle:attack_resolved',
  GAME_OVER: 'battle:game_over',
} as const;

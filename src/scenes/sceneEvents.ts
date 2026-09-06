import Phaser from 'phaser';
import { EventBus, Events } from '../core/EventBus';

/**
 * Subscribes a Phaser scene handler to STATE_CHANGED and automatically
 * unsubscribes when the scene shuts down or is destroyed.
 */
export function bindStateChanged(
  scene: Phaser.Scene,
  handler: (...args: any[]) => void,
  context: object,
): void {
  EventBus.on(Events.STATE_CHANGED, handler, context);

  const cleanup = () => {
    EventBus.off(Events.STATE_CHANGED, handler, context);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY,  cleanup);
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY,  cleanup);
}

import { EventBus, Events } from './EventBus';

/**
 * The mutation-only refresh signal: "the committed GamePhase changed in place;
 * re-read it via PhaseManager.getPhase()".
 *
 * Deliberately separate from `PhaseSceneSynchronizer`: navigation starts and stops scenes,
 * a mutation only asks the already-running scene to re-render. This carries no payload —
 * `EventBus` is notification-only and never a render-data channel.
 */
export function notifyPhaseChanged(): void {
  EventBus.emit(Events.STATE_CHANGED);
}

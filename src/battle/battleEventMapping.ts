import type { BattleEvent } from './battleEvents';
import type { EffectEvent } from './combat';
import type { TurnEvent } from './turnResolver';

export function turnEventsToBattleEvents(events: TurnEvent[]): BattleEvent[] {
  return events.map(turnEventToBattleEvent);
}

function turnEventToBattleEvent(event: TurnEvent): BattleEvent {
  switch (event.type) {
    case 'turn_skipped':
      return {
        type: 'turn_skipped',
        unitId: event.unitId,
        unitName: event.unitName,
        reason: event.reason,
      };

    case 'turn_charged':
      return {
        type: 'turn_charged',
        unitId: event.unitId,
        unitName: event.unitName,
      };

    case 'round_effect':
      return effectEventToBattleEvent(event.event);

    default:
      return assertNever(event);
  }
}

function effectEventToBattleEvent(event: EffectEvent): BattleEvent {
  switch (event.type) {
    case 'effect_applied':
      return {
        type: 'effect_applied',
        unitId: event.unitId,
        unitName: event.unitName,
        effectDisplayName: event.effectDisplayName,
      };

    case 'effect_tick_heal':
      return {
        type: 'effect_tick_heal',
        unitId: event.unitId,
        unitName: event.unitName,
        effectDisplayName: event.effectDisplayName,
        amount: event.amount,
      };

    case 'effect_tick_damage':
      return {
        type: 'effect_tick_damage',
        unitId: event.unitId,
        unitName: event.unitName,
        effectDisplayName: event.effectDisplayName,
        amount: event.amount,
      };

    case 'effect_expired':
      return {
        type: 'effect_expired',
        unitId: event.unitId,
        unitName: event.unitName,
        effectDisplayName: event.effectDisplayName,
      };

    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected event: ${JSON.stringify(value)}`);
}

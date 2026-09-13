import type { BattleEvent } from '../battle/battleEvents';
import type { Side } from '../shared/gridTypes';

export type BattleLogEntryType = 'positive' | 'negative' | 'neutral';

type BattleActorLogStyle = Extract<BattleLogEntryType, 'positive' | 'negative'>;

export type BattleFloatingTextKind = 'damage' | 'heal';

export type BattleEventPresentation = {
  logEntry?: {
    text: string;
    type: BattleLogEntryType;
  };
  floatingText?: {
    unitId: string;
    kind: BattleFloatingTextKind;
    amount: number;
  };
};

export type BattleEventPresentationContext = {
  activeUnitSide: Side | null;
};

// ─────────────────────────────────────────────────────────────────────────────

export function buildBattleEventPresentations(
  events: BattleEvent[],
  context: BattleEventPresentationContext,
): BattleEventPresentation[] {
  const style = actorLogStyle(context.activeUnitSide);
  return events.map(event => presentBattleEvent(event, style));
}

function actorLogStyle(side: Side | null): BattleActorLogStyle {
  return side === 'player' ? 'positive' : 'negative';
}

function presentBattleEvent(
  event: BattleEvent,
  style: BattleActorLogStyle,
): BattleEventPresentation {
  switch (event.type) {

    case 'skill_heal':
      return {
        floatingText: { unitId: event.targetId, kind: 'heal', amount: event.amount },
        logEntry: {
          text: `${event.casterName} heals ${event.targetName} +${event.amount}`,
          type: style,
        },
      };

    case 'skill_damage':
      return {
        floatingText: { unitId: event.targetId, kind: 'damage', amount: event.amount },
        logEntry: {
          text: event.blocked
            ? `${event.casterName} attacks ${event.targetName} — blocked! -${event.amount}`
            : `${event.casterName} attacks ${event.targetName} -${event.amount}`,
          type: event.blocked ? 'neutral' : style,
        },
      };

    case 'skill_dodged':
      return {
        logEntry: {
          text: `${event.targetName} dodged the attack!`,
          type: 'neutral',
        },
      };

    case 'item_heal':
      // Names the item, because the player chose it: a bare "restored N HP" would read like a
      // passive effect rather than the action they just spent.
      return {
        floatingText: { unitId: event.unitId, kind: 'heal', amount: event.amount },
        logEntry: {
          text: `${event.unitName} drinks ${event.itemName} and restores ${event.amount} HP`,
          type: 'positive',
        },
      };

    case 'item_revive':
      // Names the item and both units: the player spent this action on a specific corpse.
      return {
        floatingText: { unitId: event.targetId, kind: 'heal', amount: event.amount },
        logEntry: {
          text: `${event.unitName} reads ${event.itemName} and revives ${event.targetName} +${event.amount} HP`,
          type: 'positive',
        },
      };

    case 'vampirism_heal':
      return {
        floatingText: { unitId: event.unitId, kind: 'heal', amount: event.amount },
        logEntry: {
          text: `${event.unitName} restored ${event.amount} HP (vampirism)`,
          type: 'positive',
        },
      };

    case 'effect_applied':
      return {
        logEntry: {
          text: `${event.unitName} is affected by ${event.effectDisplayName}`,
          type: 'neutral',
        },
      };

    case 'probability_effect_applied':
      return {
        logEntry: {
          text: `${event.unitName} is affected by ${event.displayName}!`,
          type: 'neutral',
        },
      };

    case 'probability_effect_failed':
      return {
        logEntry: {
          text: `${event.displayName} failed on ${event.unitName}`,
          type: 'neutral',
        },
      };

    case 'unit_distracted':
      return {
        logEntry: {
          text: `${event.unitName} is distracted and skips its turn!`,
          type: 'neutral',
        },
      };

    case 'counter_attack_start':
      return {
        logEntry: {
          text: `${event.attackerName} is provoked — counter-attacks ${event.targetName}!`,
          type: 'neutral',
        },
      };

    case 'counter_attack_unavailable':
      return {
        logEntry: {
          text: counterAttackUnavailableText(event),
          type: 'neutral',
        },
      };

    case 'turn_skipped':
      return {
        logEntry: {
          text: event.reason === 'manual_skip'
            ? `${event.unitName} skips their turn`
            : `${event.unitName} — blocked, skipping turn`,
          type: 'neutral',
        },
      };

    case 'turn_charged':
      return {
        logEntry: {
          text: `${event.unitName} charges their turn (acts last this round)`,
          type: 'neutral',
        },
      };

    case 'effect_tick_heal':
      // No floating text for tick heals — preserves current behavior.
      return {
        logEntry: {
          text: `${event.unitName} regenerates +${event.amount} HP (${event.effectDisplayName})`,
          type: 'positive',
        },
      };

    case 'effect_tick_damage':
      // No floating text for tick damage — preserves current behavior.
      return {
        logEntry: {
          text: `${event.unitName} takes -${event.amount} HP (${event.effectDisplayName})`,
          type: 'negative',
        },
      };

    case 'effect_expired':
      return {
        logEntry: {
          text: `${event.effectDisplayName} expired on ${event.unitName}`,
          type: 'neutral',
        },
      };

    case 'unit_revived':
      // Stage 2: reuses the existing 'heal' floating text kind. Stage 3 may
      // introduce a dedicated revive presentation kind.
      return {
        floatingText: { unitId: event.targetId, kind: 'heal', amount: event.amount },
        logEntry: {
          text: `${event.casterName} revived ${event.targetName} +${event.amount}`,
          type: style,
        },
      };

    default:
      return assertNever(event);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function counterAttackUnavailableText(
  event: Extract<BattleEvent, { type: 'counter_attack_unavailable' }>,
): string {
  switch (event.reason) {
    case 'out_of_range':
      // targetName is always populated when reason === 'out_of_range'; see battleEvents.ts comment.
      return `${event.unitName} was provoked but can't reach ${event.targetName!} — skips turn`;
    case 'caster_dead':
      return `${event.unitName} was provoked but the provoker is gone — skips turn`;
    case 'no_basic_attack':
      return `${event.unitName} was provoked but has no basic attack — skips turn`;
    default:
      return assertNever(event.reason);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected battle presentation value: ${JSON.stringify(value)}`);
}

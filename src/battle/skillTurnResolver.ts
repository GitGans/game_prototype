import type { BattleState, CellCoord } from './types';
import type { BattleEvent } from './battleEvents';
import type { TurnContext } from './turnResolver';
import type { Side } from '../shared/gridTypes';
import type { Rng } from '../shared/random';
import { resolveBattleTransition } from './battleTransition';
import { checkGameOver } from './combat';

export type SkillTurnResult = {
  state:   BattleState;
  context: TurnContext;
  events:  BattleEvent[];
  winner:  Side | null;
};

/**
 * Resolves a complete skill turn:
 *   [optional select_skill] → use_skill → checkGameOver → advance_turn → checkGameOver
 *
 * When persistSkillSelection is true and skillIndex is defined, the function
 * first commits the chosen skill index via select_skill (its events are
 * intentionally discarded, matching existing auto-turn behavior). This is
 * required for the auto path; the manual path omits it.
 */
export function resolveSkillTurn(input: {
  state:                  BattleState;
  context:                TurnContext;
  unitId:                 string;
  target:                 CellCoord;
  skillIndex?:            number;
  persistSkillSelection?: boolean;
  rng:                    Rng;
}): SkillTurnResult {
  const { unitId, target, skillIndex, persistSkillSelection, rng } = input;
  let { state, context } = input;

  // Optional select_skill pre-step (auto path only).
  // Persists the chosen skill index so use_skill resolves the correct skill.
  // Events from select_skill are discarded — this matches how the auto branch
  // currently drops select_skill events before passing the result to use_skill.
  if (persistSkillSelection && skillIndex !== undefined) {
    const selected = resolveBattleTransition({
      state,
      context,
      action: { type: 'select_skill', skillIndex },
      rng,
    });
    state   = selected.state;
    context = selected.context;
  }

  // Skill use.
  const used = resolveBattleTransition({
    state,
    context,
    action: { type: 'use_skill', unitId, target, skillIndex },
    rng,
  });
  state   = used.state;
  context = used.context;
  let events: BattleEvent[] = used.events;

  // First game-over check — skill may have killed the last enemy.
  // Must happen before advance_turn; do not collapse into withWinner.
  const winnerAfterSkill = checkGameOver(state);
  if (winnerAfterSkill) {
    return { state: { ...state, phase: 'end' }, context, events, winner: winnerAfterSkill };
  }

  // Turn advancement (ticks round effects, which can also end the battle).
  const advanced = resolveBattleTransition({
    state,
    context,
    action: { type: 'advance_turn' },
    rng,
  });
  state   = advanced.state;
  context = advanced.context;
  events  = [...events, ...advanced.events];

  // Second game-over check — round effects may have finished the battle.
  const winnerAfterAdvance = checkGameOver(state);
  if (winnerAfterAdvance) {
    return { state: { ...state, phase: 'end' }, context, events, winner: winnerAfterAdvance };
  }

  return { state, context, events, winner: null };
}

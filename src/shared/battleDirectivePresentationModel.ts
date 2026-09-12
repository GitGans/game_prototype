export type ManualTargetPromptKind = 'attack' | 'heal' | 'revive';

export type BattleDirectivePresentationInput =
  | {
      type: 'schedule_auto_turn';
      delayKind: 'auto_player' | 'auto_enemy';
      unitName: string | null;
    }
  | {
      type: 'await_manual_target';
      promptKind: ManualTargetPromptKind;
      unitName: string | null;
    }
  /**
   * A manual turn with actions but no attack target to prompt for — a blocked melee turn for a
   * unit carrying a usable item. The bar is shown; no targeting prompt is.
   */
  | {
      type: 'await_manual_action';
      unitName: string | null;
    }
  | { type: 'none' };

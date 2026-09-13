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
   * A manual turn whose selected skill has no valid targets — for any target policy, with or
   * without an equipped item. The action bar is shown; no targeting prompt is.
   */
  | {
      type: 'await_manual_action';
      unitName: string | null;
    }
  | { type: 'none' };

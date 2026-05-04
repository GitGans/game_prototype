export type ManualTargetPromptKind = 'attack' | 'heal';

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
  | { type: 'none' };

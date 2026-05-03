import type {
  BattleDirectivePresentationInput,
  ManualTargetPromptKind,
} from '../shared/battleDirectivePresentationModel';

export type BattleDirectivePresentation = {
  statusText?: string;
  displaySkillBar?: boolean;
};

export function buildManualTargetStatusText(
  promptKind: ManualTargetPromptKind,
  unitName: string | null,
): string {
  const name = unitName ?? '?';
  return promptKind === 'heal'
    ? `${name} — Click on the green cell to heal`
    : `${name} — Click on the red cell to attack`;
}

export function buildBattleDirectivePresentation(
  input: BattleDirectivePresentationInput,
): BattleDirectivePresentation {
  switch (input.type) {
    case 'schedule_auto_turn':
      return {
        statusText:
          input.delayKind === 'auto_player'
            ? `${input.unitName ?? '?'} turn… (auto)`
            : `${input.unitName ?? '?'} turn…`,
      };

    case 'await_manual_target':
      return {
        statusText: buildManualTargetStatusText(input.promptKind, input.unitName),
        displaySkillBar: true,
      };

    case 'none':
      return {};

    default: {
      const _exhaustive: never = input;
      throw new Error(`Unhandled directive input: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

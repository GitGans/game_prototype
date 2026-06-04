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
  switch (promptKind) {
    case 'heal':
      return `${name} — Click on the green cell to heal`;
    case 'revive':
      return `${name} — Click on a fallen ally to revive`;
    case 'attack':
      return `${name} — Click on the red cell to attack`;
    default: {
      const _exhaustive: never = promptKind;
      return _exhaustive;
    }
  }
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

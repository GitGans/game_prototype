import type { TurnStartDirective } from '../battle/turnResolver';

export type BattleDirectivePresentation = {
  statusText?: string;
  displaySkillBar?: boolean;
};

export type BattleDirectivePresentationContext = {
  unitName: string | null;
};

export function buildManualTargetStatusText(
  promptKind: 'attack' | 'heal',
  unitName: string | null,
): string {
  const name = unitName ?? '?';
  return promptKind === 'heal'
    ? `${name} — Click on the green cell to heal`
    : `${name} — Click on the red cell to attack`;
}

export function buildBattleDirectivePresentation(
  directive: TurnStartDirective,
  context: BattleDirectivePresentationContext,
): BattleDirectivePresentation {
  const unitName = context.unitName ?? '?';

  switch (directive.type) {
    case 'schedule_auto_turn':
      return {
        statusText:
          directive.delayKind === 'auto_player'
            ? `${unitName} turn… (auto)`
            : `${unitName} turn…`,
      };

    case 'await_manual_target':
      return {
        statusText: buildManualTargetStatusText(directive.promptKind, unitName),
        displaySkillBar: true,
      };

    case 'none':
    case 'continue_immediately':
    case 'schedule_next_turn':
      return {};

    default:
      return assertNever(directive);
  }
}

function assertNever(value: never): never {
  throw new Error(
    `Unexpected battle directive presentation value: ${JSON.stringify(value)}`,
  );
}

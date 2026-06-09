import { describe, it, expect } from 'vitest';
import { resolveManualTargetPromptKindForUnit } from '../../src/core/battleDirectiveProjection';
import { buildManualTargetStatusText } from '../../src/objects/battleDirectivePresentation';
import type { BattleUnitSnapshot } from '../../src/shared/battleSnapshots';
import type { ActionSkillDefinition } from '../../src/shared/skillDefinitionTypes';
import { SHAPES } from '../../src/data/shapeDefinitions';

const neutralPair = (n: number) => ({ highlightBase: n, value: n });

function makeSnapshotWithSkill(skill: ActionSkillDefinition, name = 'S'): BattleUnitSnapshot {
  return {
    id: 's', side: 'player', name, className: 'C', currentHp: 100, maxHp: 100, lifeState: 'alive',
    statDisplay: {
      level: 1,
      hp: neutralPair(100), maxHp: neutralPair(100),
      physicalStrength: neutralPair(0), magicalStrength: neutralPair(0),
      physicalDefense: neutralPair(0), magicalDefense: neutralPair(0),
      dodge: neutralPair(0), block: neutralPair(0), initiative: neutralPair(0),
    },
    shape: SHAPES['1x1'],
    deployment: { kind: 'field', anchor: { side: 'player', row: 0, col: 0 } },
    spriteKey: null,
    skills: [skill],
    activeSkillIndex: 0,
    activeEffects: [],
    rowTrait: 'front',
    templateId: 't',
    activatableAbilities: [],
  };
}

const reviveSkill: ActionSkillDefinition = {
  id: 'test_revive', name: 'Test Revive',
  targetPolicy: { type: 'dead_friendly' },
  actions: [
    { type: 'revive', level: 1, matrix: { kind: 'effect_area_matrix', matrixName: 'single' } },
  ],
};

const healSkill: ActionSkillDefinition = {
  id: 'test_heal', name: 'Test Heal',
  targetPolicy: { type: 'alive_friendly' },
  actions: [
    {
      type: 'heal',
      powerSource: 'magical_strength',
      matrix: { kind: 'multiplier_matrix', matrixName: 'single', level: 1 },
    },
  ],
};

const meleeSkill: ActionSkillDefinition = {
  id: 'test_melee', name: 'Test Melee',
  targetPolicy: { type: 'enemy_melee' },
  actions: [
    {
      type: 'damage',
      powerSource: 'physical_strength',
      matrix: { kind: 'multiplier_matrix', matrixName: 'single', level: 1 },
    },
  ],
};

describe('manual prompt projection — revive', () => {
  it('dead_friendly policy maps to "revive"', () => {
    expect(resolveManualTargetPromptKindForUnit(makeSnapshotWithSkill(reviveSkill))).toBe('revive');
  });

  it('alive_friendly policy maps to "heal"', () => {
    expect(resolveManualTargetPromptKindForUnit(makeSnapshotWithSkill(healSkill))).toBe('heal');
  });

  it('hostile policy maps to "attack"', () => {
    expect(resolveManualTargetPromptKindForUnit(makeSnapshotWithSkill(meleeSkill))).toBe('attack');
  });

  it('presentation builder mentions the unit and revive intent', () => {
    const text = buildManualTargetStatusText('revive', 'Lich');
    expect(text).toContain('Lich');
    expect(text).toMatch(/revive/i);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveManualTargetPromptKindForUnit } from '../../src/core/battleDirectiveProjection';
import { buildManualTargetStatusText } from '../../src/objects/battleDirectivePresentation';
import type { BattleUnitSnapshot } from '../../src/shared/battleSnapshots';
import { SKILLS } from '../../src/data/skills/skillDefinitions';
import { ucid } from '../../src/shared/unitTypes';
import { SHAPES } from '../../src/data/shapeDefinitions';

function makeSnapshot(skillId: keyof typeof SKILLS): BattleUnitSnapshot {
  return {
    id: 's', side: 'player', name: 'S', hp: 100, maxHp: 100, lifeState: 'alive',
    physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
    dodge: 0, block: 0, level: 1, initiative: 0,
    effectiveInitiative: 0, effectivePhysicalStrength: 0, effectiveMagicalStrength: 0,
    effectivePhysicalDefense: 0, effectiveMagicalDefense: 0, effectiveDodge: 0, effectiveBlock: 0,
    shape: SHAPES['1x1'],
    deployment: { kind: 'field', anchor: { side: 'player', row: 0, col: 0 } },
    spriteKey: null,
    skills: [SKILLS[skillId]],
    activeSkillIndex: 0,
    activeEffects: [],
    rowTrait: 'front',
    templateId: 't',
    activatableAbilities: [],
  };
}

describe('manual prompt projection — revive', () => {
  it('dead_friendly policy maps to "revive"', () => {
    const snap = makeSnapshot('revive');
    expect(resolveManualTargetPromptKindForUnit(snap)).toBe('revive');
  });

  it('alive_friendly policy maps to "heal"', () => {
    const snap = makeSnapshot('m_heal_basic');
    expect(resolveManualTargetPromptKindForUnit(snap)).toBe('heal');
  });

  it('hostile policy maps to "attack"', () => {
    const snap = makeSnapshot('p_melee_basic');
    expect(resolveManualTargetPromptKindForUnit(snap)).toBe('attack');
  });

  it('presentation builder renders revive copy', () => {
    expect(buildManualTargetStatusText('revive', 'Lich')).toBe(
      'Lich — Click on a fallen ally to revive',
    );
  });
});

// silence unused import
void ucid;

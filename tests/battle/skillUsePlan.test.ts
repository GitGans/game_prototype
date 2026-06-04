import { describe, it, expect } from 'vitest';
import {
  isAliveFriendlyTargetPolicy,
  isDeadFriendlyTargetPolicy,
  isEnemyMeleeTargetPolicy,
  isHostileTargetPolicy,
  type SkillTargetPolicy,
} from '../../src/battle/skillUsePlan';

const ALL: SkillTargetPolicy[] = [
  { type: 'alive_friendly' },
  { type: 'self' },
  { type: 'enemy_melee' },
  { type: 'enemy_ranged' },
  { type: 'dead_friendly' },
];

describe('target policy helpers', () => {
  it('isAliveFriendlyTargetPolicy is true only for alive_friendly', () => {
    expect(ALL.filter(isAliveFriendlyTargetPolicy).map(p => p.type))
      .toEqual(['alive_friendly']);
  });

  it('isDeadFriendlyTargetPolicy is true only for dead_friendly', () => {
    expect(ALL.filter(isDeadFriendlyTargetPolicy).map(p => p.type))
      .toEqual(['dead_friendly']);
  });

  it('isHostileTargetPolicy is true only for enemy_melee / enemy_ranged', () => {
    expect(ALL.filter(isHostileTargetPolicy).map(p => p.type))
      .toEqual(['enemy_melee', 'enemy_ranged']);
  });

  it('isEnemyMeleeTargetPolicy is true only for enemy_melee', () => {
    expect(ALL.filter(isEnemyMeleeTargetPolicy).map(p => p.type))
      .toEqual(['enemy_melee']);
  });
});

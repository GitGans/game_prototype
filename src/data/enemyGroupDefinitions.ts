import { UnitRace } from '../battle/types';

export interface EnemyGroupDefinition {
  race: UnitRace;
  levelOverride?: number;
}

export const ENEMY_GROUPS: Record<string, EnemyGroupDefinition> = {
  'orc_patrol':    { race: 'orc' },
  'orc_elite':     { race: 'orc',    levelOverride: 3 },
  'demon_patrol':  { race: 'demon' },
  'demon_elite':   { race: 'demon',  levelOverride: 3 },
  'undead_horde':  { race: 'undead' },
  'undead_elite':  { race: 'undead', levelOverride: 3 },
};

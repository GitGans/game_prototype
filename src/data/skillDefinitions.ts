import { Skill } from '../battle/types';
import { PATTERNS } from '../battle/skillPatterns';

export const SKILLS: Record<string, Skill> = {

  basic_melee: {
    id: 'basic_melee',
    name: 'Strike',
    damageType: 'physical',
    effectType: 'damage',
    pattern: PATTERNS.single,
  },

  basic_ranged: {
    id: 'basic_ranged',
    name: 'Shot',
    damageType: 'physical',
    effectType: 'damage',
    pattern: PATTERNS.single,
  },

  basic_heal: {
    id: 'basic_heal',
    name: 'Heal',
    damageType: 'physical',
    effectType: 'heal',
    pattern: PATTERNS.single,
  },

  arcane_cross: {
    id: 'arcane_cross',
    name: 'Arcane Cross',
    damageType: 'magical',
    effectType: 'damage',
    pattern: PATTERNS.cross,
  },

  row_strike: {
    id: 'row_strike',
    name: 'Row Strike',
    damageType: 'physical',
    effectType: 'damage',
    pattern: PATTERNS.row_sweep,
  },

};

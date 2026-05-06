import type { SkillPattern } from '../shared/skillTypes';
import {
  MULTIPLIER_MATRICES,
  EFFECT_AREA_MATRICES,
  PROBABILITY_MATRICES,
} from '../data/skillDefinitions';
import type { PatternRef } from './skillUsePlan';
import { requireSkillLevel } from './skillLevels';

export function resolvePlanPattern(patternRef: PatternRef): SkillPattern {
  switch (patternRef.kind) {
    case 'multiplier_matrix': {
      const matrix = MULTIPLIER_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown multiplier matrix: ${patternRef.matrixName}`);
      return requireSkillLevel(
        matrix.levels,
        patternRef.level,
        `multiplier matrix "${patternRef.matrixName}"`,
      );
    }
    case 'effect_area_matrix': {
      const matrix = EFFECT_AREA_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown effect area matrix: ${patternRef.matrixName}`);
      return requireSkillLevel(
        matrix.levels,
        patternRef.level,
        `effect area matrix "${patternRef.matrixName}"`,
      );
    }
    case 'probability_matrix': {
      const matrix = PROBABILITY_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown probability matrix: ${patternRef.matrixName}`);
      return requireSkillLevel(
        matrix.levels,
        patternRef.level,
        `probability matrix "${patternRef.matrixName}"`,
      );
    }
    default: {
      const _exhaustive: never = patternRef;
      return _exhaustive;
    }
  }
}

import type { SkillPattern } from '../shared/skillTypes';
import {
  MULTIPLIER_MATRICES,
  EFFECT_AREA_MATRICES,
  PROBABILITY_MATRICES,
} from '../data/skills';
import type { PatternRef } from './skillUsePlan';
import {
  resolveScalingMultiplierPattern,
  resolveScalingProbabilityPattern,
  resolveEffectAreaPattern,
} from './skillMatrixResolver';

export function resolvePlanPattern(patternRef: PatternRef): SkillPattern {
  switch (patternRef.kind) {
    case 'multiplier_matrix': {
      const matrix = MULTIPLIER_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown multiplier matrix: ${patternRef.matrixName}`);
      return resolveScalingMultiplierPattern(matrix, patternRef.level);
    }
    case 'probability_matrix': {
      const matrix = PROBABILITY_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown probability matrix: ${patternRef.matrixName}`);
      return resolveScalingProbabilityPattern(matrix, patternRef.level);
    }
    case 'effect_area_matrix': {
      const matrix = EFFECT_AREA_MATRICES[patternRef.matrixName];
      if (!matrix) throw new Error(`Unknown effect area matrix: ${patternRef.matrixName}`);
      return resolveEffectAreaPattern(
        matrix,
        patternRef.level,
        `effect area matrix "${patternRef.matrixName}"`,
      );
    }
    default: {
      const _exhaustive: never = patternRef;
      return _exhaustive;
    }
  }
}

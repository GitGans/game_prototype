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
} from './skillMatrixResolver';

function requireMatrix<T>(
  registry: Record<string, T>,
  matrixName: string,
  label: string,
): T {
  const matrix = registry[matrixName];
  if (!matrix) throw new Error(`Unknown ${label} matrix: ${matrixName}`);
  return matrix;
}

export function resolvePlanPattern(patternRef: PatternRef): SkillPattern {
  switch (patternRef.kind) {
    case 'multiplier_matrix':
      return resolveScalingMultiplierPattern(
        requireMatrix(MULTIPLIER_MATRICES, patternRef.matrixName, 'multiplier'),
        patternRef.level,
      );

    case 'probability_matrix':
      return resolveScalingProbabilityPattern(
        requireMatrix(PROBABILITY_MATRICES, patternRef.matrixName, 'probability'),
        patternRef.level,
      );

    case 'effect_area_matrix':
      return requireMatrix(EFFECT_AREA_MATRICES, patternRef.matrixName, 'effect area');

    default: {
      const _exhaustive: never = patternRef;
      return _exhaustive;
    }
  }
}

import type { SkillPattern } from '../shared/skillTypes';
import {
  DAMAGE_MATRICES,
  EFFECT_MATRICES,
  INSTANT_EFFECT_MATRICES,
} from '../data/skillDefinitions';
import type { PatternRef } from './skillUsePlan';

type MatrixTableEntry = {
  levels: SkillPattern[];
};

function resolveMatrixLevel(
  matrix: MatrixTableEntry | undefined,
  matrixKind: string,
  matrixName: string,
  level: number,
): SkillPattern {
  if (!matrix) {
    throw new Error(`Unknown ${matrixKind} matrix: ${matrixName}`);
  }
  return matrix.levels[level - 1] ?? matrix.levels[0];
}

export function resolvePlanPattern(patternRef: PatternRef): SkillPattern {
  switch (patternRef.kind) {
    case 'damage_matrix':
      return resolveMatrixLevel(
        DAMAGE_MATRICES[patternRef.matrixName],
        'damage',
        patternRef.matrixName,
        patternRef.level,
      );
    case 'effect_matrix':
      return resolveMatrixLevel(
        EFFECT_MATRICES[patternRef.matrixName],
        'effect',
        patternRef.matrixName,
        patternRef.level,
      );
    case 'instant_effect_matrix':
      return resolveMatrixLevel(
        INSTANT_EFFECT_MATRICES[patternRef.matrixName],
        'instant effect',
        patternRef.matrixName,
        patternRef.level,
      );
    default: {
      const _exhaustive: never = patternRef;
      return _exhaustive;
    }
  }
}

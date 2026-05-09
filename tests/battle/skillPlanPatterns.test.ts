import { describe, it, expect } from 'vitest';
import { resolvePlanPattern } from '../../src/battle/skillPlanPatterns';
import type { PatternRef } from '../../src/battle/skillUsePlan';

describe('resolvePlanPattern', () => {
  describe('effect_area_matrix', () => {
    it('returns the static shape for a known matrix', () => {
      const ref: PatternRef = { kind: 'effect_area_matrix', matrixName: 'single' };
      const result = resolvePlanPattern(ref);
      expect(result.anchorRow).toBe(0);
      expect(result.anchorCol).toBe(0);
      expect(result.cells[0][0]).not.toBeNull();
    });

    it('throws for an unknown matrix name', () => {
      const ref: PatternRef = { kind: 'effect_area_matrix', matrixName: '__unknown__' };
      expect(() => resolvePlanPattern(ref)).toThrow('Unknown effect area matrix: __unknown__');
    });
  });

  describe('multiplier_matrix', () => {
    it('throws for an unknown matrix name', () => {
      const ref: PatternRef = { kind: 'multiplier_matrix', matrixName: '__unknown__', level: 1 };
      expect(() => resolvePlanPattern(ref)).toThrow('Unknown multiplier matrix: __unknown__');
    });

    it('computes via formula for any valid level — no missing level error', () => {
      const ref: PatternRef = { kind: 'multiplier_matrix', matrixName: 'single', level: 999 };
      expect(() => resolvePlanPattern(ref)).not.toThrow();
    });

    it('throws for level 0', () => {
      const ref: PatternRef = { kind: 'multiplier_matrix', matrixName: 'single', level: 0 };
      expect(() => resolvePlanPattern(ref)).toThrow();
    });

    it('throws for fractional level', () => {
      const ref: PatternRef = { kind: 'multiplier_matrix', matrixName: 'single', level: 1.5 };
      expect(() => resolvePlanPattern(ref)).toThrow();
    });

    it('throws for NaN level', () => {
      const ref: PatternRef = { kind: 'multiplier_matrix', matrixName: 'single', level: Number.NaN };
      expect(() => resolvePlanPattern(ref)).toThrow();
    });
  });

  describe('probability_matrix', () => {
    it('throws for an unknown matrix name', () => {
      const ref: PatternRef = { kind: 'probability_matrix', matrixName: '__unknown__', level: 1 };
      expect(() => resolvePlanPattern(ref)).toThrow('Unknown probability matrix: __unknown__');
    });

    it('clamps computed value to [0..1] for high levels', () => {
      const ref: PatternRef = { kind: 'probability_matrix', matrixName: 'single', level: 999 };
      const result = resolvePlanPattern(ref);
      for (const row of result.cells) {
        for (const cell of row) {
          if (cell) expect(cell.multiplier).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});

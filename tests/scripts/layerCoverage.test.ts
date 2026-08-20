import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findUncoveredLayers } from '../../scripts/layer-coverage.mjs';

describe('findUncoveredLayers', () => {
  it('returns top-level directories that have no boundary rule, alphabetically', () => {
    expect(findUncoveredLayers({
      discoveredRoots: ['shared', 'world', 'core', 'dialogue'],
      ruleRoots: ['shared', 'core'],
      exclusions: [],
    })).toEqual(['dialogue', 'world']);
  });

  it('accepts an explicit exclusion with a non-empty architectural reason', () => {
    expect(findUncoveredLayers({
      discoveredRoots: ['shared', 'generated'],
      ruleRoots: ['shared'],
      exclusions: [
        { root: 'generated', reason: 'Generated build inputs are not TypeScript dependency layers' },
      ],
    })).toEqual([]);
  });

  it('does not accept an exclusion with an empty or whitespace-only reason', () => {
    expect(findUncoveredLayers({
      discoveredRoots: ['shared', 'generated'],
      ruleRoots: ['shared'],
      exclusions: [{ root: 'generated', reason: '   ' }],
    })).toEqual(['generated']);
  });

  it('deduplicates discovered directories', () => {
    expect(findUncoveredLayers({
      discoveredRoots: ['world', 'shared', 'world'],
      ruleRoots: ['shared'],
      exclusions: [],
    })).toEqual(['world']);
  });
});

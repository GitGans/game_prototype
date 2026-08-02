import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import {
  evaluateDirectoryPolicy,
  matchesPathPrefix,
} from '../../scripts/boundary-policy.mjs';

describe('matchesPathPrefix', () => {
  it('matches at a path-segment boundary, not a substring', () => {
    expect(matchesPathPrefix('battle/types', 'battle')).toBe(true);
    expect(matchesPathPrefix('battleFoo/types', 'battle')).toBe(false);
    expect(matchesPathPrefix('phaser', 'phaser')).toBe(true);
    expect(matchesPathPrefix('phaser/index', 'phaser')).toBe(true);
  });
});

describe('evaluateDirectoryPolicy — blocklist', () => {
  it('flags a banned path', () => {
    expect(evaluateDirectoryPolicy({
      policy: { kind: 'blocklist', banned: ['core/GameState'] },
      normalizedSpecifier: 'core/GameState',
      isRelativeSpecifier: true,
    })).toEqual({ kind: 'banned-path', entry: 'core/GameState' });
  });

  it('allows anything not on the banned list', () => {
    expect(evaluateDirectoryPolicy({
      policy: { kind: 'blocklist', banned: ['core/GameState'] },
      normalizedSpecifier: 'shared/worldTypes',
      isRelativeSpecifier: true,
    })).toBeNull();
  });
});

describe('evaluateDirectoryPolicy — src-allowlist', () => {
  const policy = {
    kind: 'src-allowlist',
    allowedSrcRoots: ['world', 'shared'],
    bannedPackages: ['phaser'],
  };

  it('allows imports from allowed src roots', () => {
    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'world/types', isRelativeSpecifier: true,
    })).toBeNull();

    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'shared/worldTypes', isRelativeSpecifier: true,
    })).toBeNull();
  });

  it('rejects a relative import outside the allowed src roots', () => {
    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'core/GameState', isRelativeSpecifier: true,
    })).toEqual({
      kind: 'outside-allowed-src-roots',
      allowedSrcRoots: ['world', 'shared'],
    });
  });

  it('rejects a future, not-yet-existing src root the same way', () => {
    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'save/saveTypes', isRelativeSpecifier: true,
    })).toEqual({
      kind: 'outside-allowed-src-roots',
      allowedSrcRoots: ['world', 'shared'],
    });
  });

  it('rejects an explicitly banned bare package', () => {
    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'phaser', isRelativeSpecifier: false,
    })).toEqual({ kind: 'banned-package', entry: 'phaser' });
  });

  it('allows a bare package that is not explicitly banned', () => {
    expect(evaluateDirectoryPolicy({
      policy, normalizedSpecifier: 'some-pure-utility', isRelativeSpecifier: false,
    })).toBeNull();
  });
});

describe('evaluateDirectoryPolicy — unknown policy kind', () => {
  it('throws rather than silently allowing the import', () => {
    expect(() => evaluateDirectoryPolicy({
      // @ts-expect-error — intentionally invalid kind for this test
      policy: { kind: 'nonsense' },
      normalizedSpecifier: 'anything',
      isRelativeSpecifier: true,
    })).toThrow(/Unknown directory boundary policy kind/);
  });
});

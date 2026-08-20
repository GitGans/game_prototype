// Pure evaluation of directory-level import policies. No fs, no process
// access — scripts/check-boundaries.mjs owns all I/O and calls into this
// module with already-normalized specifiers.

// A banned/allowed entry matches the whole normalized path or a path prefix
// at a segment boundary: 'battle' matches 'battle/types' but not 'battleFoo'.
export function matchesPathPrefix(normalized, entry) {
  const prefix = entry.replace(/\/+$/, '');
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

/**
 * Evaluates one normalized import specifier against one directory's policy.
 * Returns null when the import is allowed, or a violation descriptor when
 * it isn't. `check-boundaries.mjs` is responsible for turning a violation
 * into a human-readable error line.
 *
 * policy.kind === 'blocklist'
 *   - the current model used by every existing rule
 *   - banned: string[] — layer/package prefixes this directory may not import
 *
 * policy.kind === 'src-allowlist'
 *   - used only by world/** for now
 *   - allowedSrcRoots: string[] — the only src-relative roots reachable via
 *     relative imports (checked only when the specifier is relative)
 *   - bannedPackages: string[] — bare package specifiers that are forbidden
 *     even though the allowlist otherwise only constrains src-relative paths
 */
export function evaluateDirectoryPolicy({
  policy,
  normalizedSpecifier,
  isRelativeSpecifier,
}) {
  if (policy.kind === 'blocklist') {
    const entry = policy.banned.find(candidate =>
      matchesPathPrefix(normalizedSpecifier, candidate),
    );

    return entry ? { kind: 'banned-path', entry } : null;
  }

  if (policy.kind === 'src-allowlist') {
    if (isRelativeSpecifier) {
      const allowed = policy.allowedSrcRoots.some(root =>
        matchesPathPrefix(normalizedSpecifier, root),
      );

      return allowed
        ? null
        : {
            kind: 'outside-allowed-src-roots',
            allowedSrcRoots: [...policy.allowedSrcRoots],
          };
    }

    const bannedPackage = policy.bannedPackages.find(candidate =>
      matchesPathPrefix(normalizedSpecifier, candidate),
    );

    return bannedPackage ? { kind: 'banned-package', entry: bannedPackage } : null;
  }

  throw new Error(`Unknown directory boundary policy kind: "${policy.kind}"`);
}

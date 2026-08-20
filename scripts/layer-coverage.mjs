/**
 * Returns top-level source directories that have neither a directory rule
 * nor an explicit exclusion carrying a non-empty architectural reason.
 */
export function findUncoveredLayers({
  discoveredRoots,
  ruleRoots,
  exclusions,
}) {
  const covered = new Set(ruleRoots);
  const explicitlyExcluded = new Set(
    exclusions
      .filter(({ root, reason }) =>
        typeof root === 'string' &&
        root.length > 0 &&
        typeof reason === 'string' &&
        reason.trim().length > 0,
      )
      .map(({ root }) => root),
  );

  return [...new Set(discoveredRoots)]
    .filter(root => !covered.has(root) && !explicitlyExcluded.has(root))
    .sort();
}

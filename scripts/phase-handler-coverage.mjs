// Pure comparison of discovered phase-handler files against their registered
// import policies and exclusions. No fs, no process access.
export function checkPhaseHandlerCoverage({
  discoveredHandlers,
  policies,
  exclusions,
}) {
  const problems = [];
  const policyKeys = new Set(Object.keys(policies));
  const discoveredSet = new Set(discoveredHandlers);

  const exclusionCounts = new Map();
  for (const { handler } of exclusions) {
    exclusionCounts.set(handler, (exclusionCounts.get(handler) ?? 0) + 1);
  }
  for (const [handler, count] of exclusionCounts) {
    if (count > 1) {
      problems.push(`${handler} has ${count} duplicate coverage exclusions`);
    }
  }

  for (const handler of discoveredHandlers) {
    const hasPolicy = policyKeys.has(handler);
    const hasExclusion = exclusionCounts.has(handler);

    if (!hasPolicy && !hasExclusion) {
      problems.push(`${handler} has no import policy and no coverage exclusion`);
    } else if (hasPolicy && hasExclusion) {
      problems.push(`${handler} has both an import policy and a coverage exclusion`);
    }
  }

  for (const exclusion of exclusions) {
    if (!exclusion.reason || exclusion.reason.trim().length === 0) {
      problems.push(`${exclusion.handler} exclusion has no non-empty reason`);
    }
  }

  for (const key of policyKeys) {
    if (!discoveredSet.has(key)) {
      problems.push(`policy for ${key} refers to a handler that is not present`);
    }
  }
  for (const handler of exclusionCounts.keys()) {
    if (!discoveredSet.has(handler)) {
      problems.push(`exclusion for ${handler} refers to a handler that is not present`);
    }
  }

  return problems;
}

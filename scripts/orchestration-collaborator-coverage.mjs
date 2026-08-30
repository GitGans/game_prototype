// Stage 4C reverse coverage: derives the coverage obligation from the Stage 4A facade
// registry, so every direct, non-neutral collaborator must carry exactly one canonical exact
// import policy.
//
// Stage 4A closes the three orchestration facades. It says nothing about what their registered
// collaborators may import, which leaves the hidden-monolith route one level down. This module
// computes WHICH modules owe a policy and WHICH registry owns each one; scripts/
// check-boundaries.mjs then enforces those policies against the real sources.
//
// Pure: no fs, no process access. The caller supplies `sourceFiles` (src-relative posix paths
// from its own walk), so module resolution is a set lookup rather than a filesystem probe and
// this module stays unit-testable with synthetic inputs.
//
// Error model matches its siblings: every problem with configuration DATA is returned as a
// string; nothing here throws for user-authored input, so the checker always reports through
// its own boundary diagnostics rather than dying during module initialization.
//
// Fail-closed: any problem yields NO coverage at all. A partially compiled set would read as
// satisfied while enforcing less than the registry says.

import { validateCollaboratorRegistry } from "./orchestration-collaborator-policy.mjs";

const NEUTRAL_ROLE = "neutral-contract";
const EXACT_ALLOWLIST_KIND = "exact-import-allowlist";
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const DESCRIPTOR_KEYS = ["name", "policies"];
const POLICY_KEYS = ["kind", "allowedSpecifiers"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.includes(key));
}

function hasSourceExtension(key) {
  return SOURCE_EXTENSIONS.some((extension) => key.endsWith(extension));
}

/**
 * Candidate file keys for one extensionless collaborator specifier, in fixed order.
 *
 * Never assume `${specifier}.ts` succeeds: a missing file must become a diagnosed
 * configuration error, never a module that reads as having zero imports — a vacuous pass is
 * exactly the failure mode this coverage exists to prevent.
 */
function candidateFileKeys(specifier) {
  return [
    `${specifier}.ts`,
    `${specifier}.tsx`,
    `${specifier}/index.ts`,
    `${specifier}/index.tsx`,
  ];
}

/**
 * Structural validation of the supplied policy registries.
 *
 * As in restricted-import-targets.mjs, structural validity is established BEFORE any value is
 * interpolated — template interpolation of a Symbol throws, which would break fail-closed.
 */
function validatePolicyRegistries(policyRegistries, stage4cRegistryName) {
  const problems = [];

  if (!Array.isArray(policyRegistries)) {
    return ["policyRegistries must be an array of { name, policies } descriptors"];
  }

  const seenNames = new Set();

  policyRegistries.forEach((descriptor, index) => {
    if (!isPlainObject(descriptor)) {
      problems.push(`policy registry ${index} must be an object`);
      return;
    }
    for (const key of unknownKeys(descriptor, DESCRIPTOR_KEYS)) {
      problems.push(`policy registry ${index} has an unrecognised field "${key}"`);
    }

    const { name, policies } = descriptor;

    if (typeof name !== "string" || name.trim() === "") {
      problems.push(`policy registry ${index} needs a non-empty name`);
      return;
    }
    if (seenNames.has(name)) problems.push(`duplicate policy registry name "${name}"`);
    seenNames.add(name);

    if (!isPlainObject(policies)) {
      problems.push(`policy registry "${name}" must map file keys to policies`);
      return;
    }

    for (const [fileKey, policy] of Object.entries(policies)) {
      // Keys are compared literally against the src file walk. An extensionless key would
      // match nothing — a policy that silently stops applying, i.e. a fail-OPEN hole.
      if (!hasSourceExtension(fileKey)) {
        problems.push(`"${name}" key "${fileKey}" must carry a .ts/.tsx extension`);
        continue;
      }
      if (!isPlainObject(policy)) {
        problems.push(`"${name}" policy for "${fileKey}" must be an object`);
        continue;
      }
      for (const key of unknownKeys(policy, POLICY_KEYS)) {
        problems.push(`"${name}" policy for "${fileKey}" has an unrecognised field "${key}"`);
      }
      // evaluateDirectoryPolicy THROWS on an unknown kind — it must never see one from here.
      if (policy.kind !== EXACT_ALLOWLIST_KIND) {
        problems.push(
          `"${name}" policy for "${fileKey}" must have kind "${EXACT_ALLOWLIST_KIND}"`,
        );
        continue;
      }
      if (!Array.isArray(policy.allowedSpecifiers)) {
        problems.push(`"${name}" policy for "${fileKey}" needs an allowedSpecifiers array`);
        continue;
      }

      // Duplicate rejection only. Sortedness is deliberately NOT validated: this validator
      // runs over ALL THREE canonical registries, and every list in
      // PHASE_HANDLER_IMPORT_POLICIES is currently unsorted (the battle handler starts
      // battle/types, core/phases, shared/random, battle/initiative, ...). Enforcing order
      // would immediately reject a valid configuration and force a reordering of Stage 4A
      // policies plus their test pins — churn for no gain: sortedness is a reviewability
      // preference, while exact membership, duplicate rejection and two-way parity are what
      // actually deliver the guarantee.
      const seenSpecifiers = new Set();

      for (const specifier of policy.allowedSpecifiers) {
        if (typeof specifier !== "string" || specifier.trim() === "") {
          problems.push(
            `"${name}" policy for "${fileKey}" has an empty or non-string allowed specifier`,
          );
          break;
        }
        if (seenSpecifiers.has(specifier)) {
          problems.push(`"${name}" policy for "${fileKey}" allows "${specifier}" twice`);
        }
        seenSpecifiers.add(specifier);
      }
    }
  });

  if (typeof stage4cRegistryName !== "string" || stage4cRegistryName.trim() === "") {
    problems.push("stage4cRegistryName must be a non-empty string");
  } else if (!seenNames.has(stage4cRegistryName)) {
    problems.push(
      `stage4cRegistryName "${stage4cRegistryName}" names no supplied policy registry`,
    );
  }

  return problems;
}

function validateSourceFiles(sourceFiles) {
  if (!Array.isArray(sourceFiles)) return ["sourceFiles must be an array"];

  const problems = [];
  const seen = new Set();

  for (const fileKey of sourceFiles) {
    if (typeof fileKey !== "string" || fileKey.trim() === "") {
      problems.push("sourceFiles contains an empty or non-string path");
      continue;
    }
    if (!hasSourceExtension(fileKey)) {
      problems.push(`sourceFiles entry "${fileKey}" is not a .ts/.tsx source path`);
      continue;
    }
    if (seen.has(fileKey)) problems.push(`sourceFiles lists "${fileKey}" twice`);
    seen.add(fileKey);
  }

  return problems;
}

/**
 * The single compilation entry point: facade registry + canonical policy registries + the real
 * source file list → { problems, coverage }.
 *
 * Never throws for configuration data. `coverage` is empty whenever `problems` is non-empty, so
 * a broken configuration can never be mistaken for a satisfied one.
 *
 * @returns {{ problems: string[], coverage: Array<{
 *   specifier: string, fileKey: string, registryName: string, policy: object,
 * }> }}
 */
export function compileCollaboratorCoverage({
  registry,
  policyRegistries,
  stage4cRegistryName,
  sourceFiles,
}) {
  const problems = [];

  // validateCollaboratorRegistry throws only for a caller error (a non-object), so guard that
  // here and keep the data path total.
  if (!isPlainObject(registry)) {
    return { problems: ["collaborator registry must be an object"], coverage: [] };
  }

  problems.push(...validateCollaboratorRegistry(registry));
  problems.push(...validatePolicyRegistries(policyRegistries, stage4cRegistryName));
  problems.push(...validateSourceFiles(sourceFiles));

  if (problems.length > 0) return { problems, coverage: [] };

  // ── Derive required collaborators ─────────────────────────────────────────
  // Only `neutral-contract` edges are exempt. Every other role creates an obligation —
  // including a role this file has never heard of, which validateCollaboratorRegistry has
  // already rejected above. Unknown roles therefore fail CLOSED rather than slipping through
  // as "not neutral, so ignore" or "not known, so exempt".
  //
  // Deduplicated by specifier across facades: a module registered by two facades is ONE
  // obligation. A module that is neutral for one facade and non-neutral for another stays
  // required — the stricter classification wins.
  const required = new Set();
  for (const { collaborators } of Object.values(registry)) {
    for (const { specifier, role } of collaborators) {
      if (role !== NEUTRAL_ROLE) required.add(specifier);
    }
  }

  const sourceSet = new Set(sourceFiles);
  const byName = new Map(policyRegistries.map(({ name, policies }) => [name, policies]));
  const coverage = [];
  const requiredFileKeys = new Set();

  for (const specifier of [...required].sort()) {
    // ── Resolve to exactly one source file ──────────────────────────────────
    const matches = candidateFileKeys(specifier).filter((key) => sourceSet.has(key));

    if (matches.length === 0) {
      problems.push(`collaborator "${specifier}" resolves to no source module`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(
        `collaborator "${specifier}" resolves ambiguously to ${matches.join(", ")}`,
      );
      continue;
    }

    const fileKey = matches[0];
    requiredFileKeys.add(fileKey);

    // ── Exactly one canonical policy ────────────────────────────────────────
    const owners = [...byName.entries()]
      .filter(([, policies]) => Object.hasOwn(policies, fileKey))
      .map(([name]) => name);

    if (owners.length === 0) {
      problems.push(
        `"${fileKey}" is a facade collaborator with no exact import policy — ` +
          `add one to ${stage4cRegistryName}`,
      );
      continue;
    }
    if (owners.length > 1) {
      problems.push(
        `"${fileKey}" has import policies in ${owners.join(" and ")} — ` +
          `exactly one registry must be authoritative`,
      );
      continue;
    }

    coverage.push({
      specifier,
      fileKey,
      registryName: owners[0],
      policy: byName.get(owners[0])[fileKey],
    });
  }

  // ── Stale Stage 4C entries ────────────────────────────────────────────────
  // One-sided ON PURPOSE. The other two registries legitimately govern modules that are not
  // direct facade collaborators — core/phaseHandlers/battlePhaseHandler.ts (imported by
  // battlePhaseEffects, not by a facade), core/battleRuntimeStorage.ts and
  // core/battleRuntimeWriteAccess.ts — each already covered by its own rule. Only the Stage 4C
  // registry exists solely to serve this obligation, so only it can hold a stale entry.
  for (const fileKey of Object.keys(byName.get(stage4cRegistryName))) {
    if (!requiredFileKeys.has(fileKey)) {
      problems.push(
        `stale ${stage4cRegistryName} entry "${fileKey}" — it is not a facade collaborator; ` +
          `remove it rather than leaving a dormant permission`,
      );
    }
  }

  if (problems.length > 0) return { problems, coverage: [] };

  return { problems, coverage };
}

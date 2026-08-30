// Closes a state-holder class in BOTH dimensions: what it stores, and what it exposes.
//
// A field allowlist alone does not close a capability. Battle runtime could return as a public
// accessor over module-local storage declared outside the class, which no field registry can
// see. "GameState owns campaign and debug containers only" is an architectural guarantee, so
// both surfaces get an exact, fail-closed policy.
//
// Pure: no fs, no process access. scripts/check-boundaries.mjs reads the source and formats
// the diagnostics; the tests drive this function with the real source and with synthetic ones.

import { findClassMembers } from "./ts-class-members.mjs";

const PUBLIC_API_FORMS = new Set(["method", "getter", "setter"]);
const FIELD_FORMS = new Set(["field", "parameter-property"]);

/**
 * Returns human-readable problems; [] means the class matches both registries.
 *
 * Fails closed on:
 *   - a missing class (renamed, moved, deleted) — the policy cannot be enforced at all;
 *   - an unapprovable member form (index signature, computed key, unnameable, ECMA-private),
 *     rejected before any name matching because no name allowlist can bound one;
 *   - an unregistered field or public member;
 *   - a stale registration, whose dormant permission would otherwise let a removed member
 *     return without review;
 *   - a registered STATE FIELD that has become public, which exports the container whole
 *     rather than a method over it.
 */
export function evaluateStateOwnershipPolicy({
  sourceText,
  className,
  fileName,
  allowedFields,
  allowedPublicApi,
}) {
  const { found, members } = findClassMembers(sourceText, { className, fileName });
  if (!found) {
    return [`class ${className} not found — state-ownership policy cannot be enforced`];
  }

  const problems = [];

  for (const member of members) {
    if (member.form === "constructor") continue;

    if (member.form === "index-signature") {
      problems.push(`${className}:${member.line} index signature — an allowlist cannot bound it`);
    } else if (member.name.kind === "computed" || member.name.kind === "unnamed") {
      problems.push(
        `${className}:${member.line} ${member.name.kind} member — an allowlist cannot bound it`,
      );
    } else if (member.name.kind === "ecma-private") {
      problems.push(
        `${className}:${member.line} ECMA-private member — use the private modifier so the ` +
          `field registry can see it`,
      );
    }
  }

  const named = members.filter((member) => member.name.kind === "named");

  const declaredFields = named
    .filter((member) => FIELD_FORMS.has(member.form))
    .map((member) => member.name.name);

  // Methods and accessors only: a public FIELD is already reported by the field registry, so
  // including it here would report one declaration twice.
  const declaredPublicApi = named
    .filter((member) => member.isPublic && PUBLIC_API_FORMS.has(member.form))
    .map((member) => member.name.name);

  for (const member of named) {
    if (!FIELD_FORMS.has(member.form)) continue;
    if (member.isPublic && allowedFields.includes(member.name.name)) {
      problems.push(
        `${className}:${member.line} state field "${member.name.name}" must stay private/protected`,
      );
    }
  }

  problems.push(
    ...diffBothWays(declaredFields, allowedFields, className, "GAME_STATE_FIELDS", "field"),
    ...diffBothWays(
      declaredPublicApi,
      allowedPublicApi,
      className,
      "GAME_STATE_PUBLIC_API",
      "public member",
    ),
  );

  return problems;
}

/**
 * Two-way set parity between what the class declares and what is registered.
 * Results keep first-seen / registered order so checker output is stable.
 */
function diffBothWays(declared, registered, className, registryName, label) {
  const registeredSet = new Set(registered);
  const declaredSet = new Set(declared);

  return [
    ...declared
      .filter((name) => !registeredSet.has(name))
      .map(
        (name) =>
          `unregistered ${className} ${label} "${name}" — add it to ${registryName} or remove it`,
      ),
    ...registered
      .filter((name) => !declaredSet.has(name))
      .map((name) => `stale ${registryName} entry "${name}" — no such ${label} on ${className}`),
  ];
}

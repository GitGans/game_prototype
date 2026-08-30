// Pure mechanism for the orchestration-facade collaborator registry.
// No fs, no process access: scripts/check-boundaries.mjs supplies file contents and formats
// output; this module only validates, compiles and compares.
//
// The registry classifies dependency EDGES (facade → module), not modules. The same module
// legitimately plays different architectural roles for different consumers — core/GameState is
// an authoritative-state-reader for the snapshot facade and forbidden outright for the effects
// facade — and a global per-module label could not express that.
//
// Error model — one, not two. Every problem with registry DATA is returned as a string;
// nothing here throws for user-authored configuration, so the checker always reports through
// its own boundary diagnostics rather than dying during module initialization.

/**
 * Which collaborator roles each facade kind may register.
 *
 * This table is the actual authority enforcement: `effects` can never register a state reader
 * or a snapshot projection, and neither read-side facade can register an effects owner.
 * Distinctions *within* one row (metadata-source vs metadata-rule, effects-owner vs
 * effects-infrastructure) are descriptive classification for review, not extra enforcement.
 *
 * Widening a row is an architectural decision: it must be a visible edit here plus in
 * tests/scripts/boundaryPolicy.test.ts, which pins this table exactly.
 *
 * LIMIT OF THE GUARANTEE. This table bounds WHICH modules a facade may depend on, not which
 * methods it calls on them. `authoritative-state-reader` is a reviewed classification, not a
 * mechanically enforced read-only capability: core/GameState and core/playerSessionStore both
 * expose replacement methods, and an import allowlist cannot tell a getter call from a setter
 * call. Nothing here — and nothing in Stage 4C's reverse coverage — inspects a function body.
 */
export const FACADE_KIND_ROLES = {
  effects: ["neutral-contract", "effects-owner", "effects-infrastructure"],
  metadata: [
    "neutral-contract",
    "authoritative-state-reader",
    "metadata-source",
    "metadata-rule",
  ],
  snapshot: ["neutral-contract", "authoritative-state-reader", "snapshot-projection"],
};

export const COLLABORATOR_ROLES = [...new Set(Object.values(FACADE_KIND_ROLES).flat())];

const ENTRY_KEYS = ["kind", "collaborators"];
const COLLABORATOR_KEYS = ["specifier", "role"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.includes(key));
}

/**
 * Validates one collaborator's SHAPE. Returns the entry when it is structurally sound (plain
 * object, non-empty string specifier, known role) so ordering validation never sees malformed
 * input, or null when it is not.
 *
 * Role-vs-facade-kind permission is deliberately NOT checked here: that needs the facade kind,
 * which the caller owns. A role that is real but not permitted for this facade is still
 * shape-valid.
 */
function validateCollaboratorShape(facadeKey, collaborator, problems) {
  if (!isPlainObject(collaborator)) {
    problems.push(`${facadeKey}: collaborator must be an object`);
    return null;
  }

  for (const key of unknownKeys(collaborator, COLLABORATOR_KEYS)) {
    problems.push(`${facadeKey}: collaborator has an unrecognised field "${key}"`);
  }

  const { specifier, role } = collaborator;

  if (typeof specifier !== "string" || specifier.trim() === "") {
    problems.push(`${facadeKey}: collaborator with an empty or non-string specifier`);
    return null;
  }
  if (typeof role !== "string" || role.trim() === "") {
    problems.push(`${facadeKey}: collaborator "${specifier}" has an empty or non-string role`);
    return null;
  }
  if (!COLLABORATOR_ROLES.includes(role)) {
    problems.push(`${facadeKey}: unknown collaborator role "${role}" for "${specifier}"`);
    return null;
  }

  return collaborator;
}

/**
 * Collaborators are grouped by role, groups in FACADE_KIND_ROLES order for the facade kind,
 * sorted lexicographically within a group. Deterministic — a new entry has exactly one legal
 * position — while preserving the architectural grouping this codebase documents with comments,
 * so a reviewer can see at a glance whether a facade just gained another state reader.
 *
 * Receives ONLY collaborators that already passed validateCollaboratorShape() and whose role is
 * permitted for this facade kind, so it never destructures malformed input and roleOrder.indexOf
 * never returns -1.
 */
function findOrderProblems(facadeKey, kind, collaborators) {
  const roleOrder = FACADE_KIND_ROLES[kind];
  const problems = [];
  let highWaterRank = -1;
  let previous = null;

  for (const { specifier, role } of collaborators) {
    const rank = roleOrder.indexOf(role);

    if (rank < highWaterRank) {
      problems.push(
        `${facadeKey}: collaborator "${specifier}" (${role}) breaks role grouping — ` +
          `${role} entries must precede ${previous.role} entries`,
      );
    } else if (rank === highWaterRank && previous !== null && specifier < previous.specifier) {
      problems.push(
        `${facadeKey}: collaborator "${specifier}" must be sorted before ` +
          `"${previous.specifier}" within the ${role} group`,
      );
    }

    highWaterRank = Math.max(highWaterRank, rank);
    previous = { specifier, role };
  }

  return problems;
}

/**
 * Structural validation of the whole registry. Returns human-readable problem strings; an empty
 * array means valid.
 *
 * Total over malformed input: every branch either records a problem and skips the entry, or
 * proceeds on data it has already proven well-formed. Only a caller error — passing something
 * that is not a registry object at all — throws.
 */
export function validateCollaboratorRegistry(registry) {
  if (!isPlainObject(registry)) {
    throw new TypeError("collaborator registry must be an object");
  }

  const problems = [];

  for (const [facadeKey, entry] of Object.entries(registry)) {
    if (facadeKey.trim() === "") {
      problems.push("registry contains an empty facade file path");
      continue;
    }
    if (!isPlainObject(entry)) {
      problems.push(`${facadeKey}: registry entry must be an object`);
      continue;
    }

    for (const key of unknownKeys(entry, ENTRY_KEYS)) {
      problems.push(`${facadeKey}: registry entry has an unrecognised field "${key}"`);
    }

    const { kind, collaborators } = entry;
    const allowedRoles = FACADE_KIND_ROLES[kind];

    if (!allowedRoles) {
      problems.push(
        `${facadeKey}: unknown facade kind "${kind}" — expected one of ` +
          Object.keys(FACADE_KIND_ROLES).join(", "),
      );
      continue;
    }
    if (!Array.isArray(collaborators)) {
      problems.push(`${facadeKey}: collaborators must be an array`);
      continue;
    }

    const facadeSpecifier = facadeKey.replace(/\.tsx?$/, "");
    const seen = new Set();
    const orderable = [];

    for (const collaborator of collaborators) {
      const valid = validateCollaboratorShape(facadeKey, collaborator, problems);
      if (valid === null) continue;

      const { specifier, role } = valid;
      let rolePermitted = true;

      if (!allowedRoles.includes(role)) {
        problems.push(
          `${facadeKey}: role "${role}" is not permitted for a "${kind}" facade ` +
            `(allowed: ${allowedRoles.join(", ")})`,
        );
        rolePermitted = false;
      }
      if (specifier === facadeSpecifier || specifier === facadeKey) {
        problems.push(`${facadeKey}: a facade may not register itself as a collaborator`);
      }
      if (seen.has(specifier)) {
        problems.push(`${facadeKey}: duplicate collaborator specifier "${specifier}"`);
      }
      seen.add(specifier);

      if (rolePermitted) orderable.push(valid);
    }

    problems.push(...findOrderProblems(facadeKey, kind, orderable));
  }

  return problems;
}

/**
 * The single compilation entry point: raw registry → { problems, policies }.
 *
 * Never throws for registry data. When validation fails it returns NO enforceable policies, so
 * a broken registry can never be mistaken for a satisfied one — the checker reports `problems`
 * and exits non-zero rather than scanning facades against a partial allowlist.
 */
export function compileCollaboratorRegistry(registry) {
  const problems = validateCollaboratorRegistry(registry);
  if (problems.length > 0) return { problems, policies: {} };

  const policies = Object.fromEntries(
    Object.entries(registry).map(([facadeKey, { collaborators }]) => [
      facadeKey,
      {
        kind: "exact-import-allowlist",
        allowedSpecifiers: collaborators.map(({ specifier }) => specifier),
      },
    ]),
  );

  return { problems, policies };
}

/**
 * Two-way set parity between imports discovered in a real source file and the imports some
 * reviewed policy allows.
 *
 * An exact allowlist alone catches a NEW unregistered import but not a STALE entry left behind
 * after an import is deleted — a dormant licence for that dependency to return without review.
 * Hence `stale` alongside `unregistered`.
 *
 * `discovered` may repeat (several import statements from one module) — repeats are one
 * dependency, not several. Order never matters to correctness, but output order is fixed so
 * checker and test output stay stable: `unregistered` in first-discovered order, `stale` in
 * policy order.
 *
 * This is the ONE comparison. `compareFacadeImports` below and Stage 4C's reverse coverage
 * (scripts/orchestration-collaborator-coverage.mjs) both route through it — two comparisons
 * that disagreed about a single import would let a test pass while the checker failed.
 */
export function compareImportSets({ discovered, allowed }) {
  const allowedSet = new Set(allowed);
  const discoveredSet = new Set(discovered);

  return {
    unregistered: [...discoveredSet].filter((specifier) => !allowedSet.has(specifier)),
    stale: allowed.filter((specifier) => !discoveredSet.has(specifier)),
  };
}

/**
 * Facade-registry-shaped wrapper over compareImportSets: what a facade actually imports vs what
 * is registered for it.
 *
 * The missing-facade case is deliberate and unchanged: an unregistered facade has no allowed
 * set at all, so everything it imports is unregistered and nothing can be stale.
 */
export function compareFacadeImports({ facadeKey, discoveredSpecifiers, registry }) {
  const entry = registry[facadeKey];
  if (!entry) {
    return { unregistered: [...new Set(discoveredSpecifiers)], stale: [] };
  }

  return compareImportSets({
    discovered: discoveredSpecifiers,
    allowed: entry.collaborators.map(({ specifier }) => specifier),
  });
}

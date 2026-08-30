// Pure evaluation of INBOUND (importer-direction) import restrictions: who may import a
// module, as opposed to what a module may import. No fs, no process access —
// scripts/check-boundaries.mjs owns all I/O and calls into this module with already-normalized
// specifiers, exactly like scripts/boundary-policy.mjs and
// scripts/orchestration-collaborator-policy.mjs.
//
// Capability modules need this direction. An outbound allowlist on battleRuntimeWriteAccess
// constrains what it depends on; it says nothing about who may pick up the authority to
// replace a battle attempt.

const ENTRY_FIELDS = new Set(["reason", "allowedImporters"]);

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Returns human-readable problems; [] means the registry is valid.
 *
 * STRUCTURAL VALIDITY IS ESTABLISHED BEFORE ANY CONTENT CHECK, and the content checks run
 * against values already known to be non-empty strings — never the raw array. Default
 * `Array.prototype.sort()` string-coerces its elements, so sorting an array that still
 * contains a `Symbol()`, or an object with a throwing `toString`, makes the VALIDATOR throw.
 * That would terminate the checker on exactly the malformed configuration this function
 * exists to turn into a diagnostic, breaking the fail-closed contract. The same reasoning
 * applies to `.trim()`, the extension regex and `.replace()`, and to interpolating an
 * unvalidated element into a message: `String(Symbol())` throws too, so problems name the
 * offending INDEX and its `typeof`, never its value.
 */
export function validateRestrictedImportTargets(registry) {
  const problems = [];
  if (!isPlainObject(registry)) {
    return ["restricted import target registry must be an object"];
  }

  for (const [target, entry] of Object.entries(registry)) {
    // An extension-bearing key compiles fine but can never equal a normalized specifier,
    // silently disabling the restriction. Reject the key FORMAT, not only its contents.
    if (/\.tsx?$/.test(target)) {
      problems.push(
        `${target}: target keys are normalized specifiers and must not carry a .ts/.tsx extension`,
      );
    }

    if (!isPlainObject(entry)) {
      problems.push(`${target}: entry must be an object`);
      continue;
    }

    for (const field of Object.keys(entry)) {
      if (!ENTRY_FIELDS.has(field)) {
        problems.push(`${target}: unknown field "${field}"`);
      }
    }

    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      problems.push(`${target}: reason must be a non-empty string`);
    }

    // ── 1. shape ────────────────────────────────────────────────────────────
    const importers = entry.allowedImporters;
    if (!Array.isArray(importers) || importers.length === 0) {
      problems.push(`${target}: allowedImporters must be a non-empty array`);
      continue;
    }

    // ── 2. element type ─────────────────────────────────────────────────────
    let structurallyValid = true;
    for (let index = 0; index < importers.length; index++) {
      const importer = importers[index];
      if (typeof importer !== "string" || importer.trim() === "") {
        problems.push(
          `${target}: allowedImporters[${index}] must be a non-empty string ` +
            `(received ${typeof importer})`,
        );
        structurallyValid = false;
      }
    }

    // ── 3. bail out before any content check ────────────────────────────────
    if (!structurallyValid) continue;

    // ── 4. content checks, on values now known to be non-empty strings ──────
    const seen = new Set();
    for (const importer of importers) {
      if (!/\.tsx?$/.test(importer)) {
        problems.push(`${target}: importer "${importer}" must carry a .ts/.tsx extension`);
      }
      if (importer.replace(/\.tsx?$/, "") === target) {
        problems.push(`${target}: may not register itself as an importer`);
      }
      if (seen.has(importer)) {
        problems.push(`${target}: duplicate importer "${importer}"`);
      }
      seen.add(importer);
    }

    const sorted = [...importers].sort();
    if (importers.some((importer, index) => importer !== sorted[index])) {
      problems.push(
        `${target}: allowedImporters must be sorted (expected ${sorted.join(", ")})`,
      );
    }
  }

  return problems;
}

/**
 * The single compilation entry point: raw registry → { problems, targets }.
 *
 * Never throws for registry data. On ANY problem it returns NO enforceable targets, so a
 * malformed registry can never produce a partially active policy that reads as satisfied —
 * the checker reports `problems` and exits non-zero instead of scanning against half a rule.
 *
 *   valid   → { problems: [],    targets: <compiled> }
 *   invalid → { problems: [...], targets: {} }
 */
export function compileRestrictedImportTargets(registry) {
  const problems = validateRestrictedImportTargets(registry);
  if (problems.length > 0) return { problems, targets: {} };

  const targets = Object.fromEntries(
    Object.entries(registry).map(([target, { reason, allowedImporters }]) => [
      target,
      { reason, allowedImporters: new Set(allowedImporters) },
    ]),
  );

  return { problems, targets };
}

/**
 * The restricted target an observed specifier hits, or null.
 *
 * Exact match, deliberately not a path-prefix match: a submodule of a restricted target is a
 * different module with its own surface and must be registered separately rather than
 * inheriting a restriction nobody reviewed for it.
 */
export function resolveRestrictedTarget(normalizedSpecifier, targets) {
  return Object.hasOwn(targets, normalizedSpecifier) ? normalizedSpecifier : null;
}

/** null when the import is allowed; a violation descriptor when it is not. */
export function evaluateObservedImport({ importerKey, normalizedSpecifier, targets }) {
  const target = resolveRestrictedTarget(normalizedSpecifier, targets);
  if (target === null) return null;

  // A module importing itself is not an authority transfer.
  if (importerKey === `${target}.ts` || importerKey === `${target}.tsx`) return null;

  if (targets[target].allowedImporters.has(importerKey)) return null;

  return { target, reason: targets[target].reason };
}

/**
 * Registered importers that no longer import their target.
 *
 * An allowlist alone catches a NEW unauthorized importer but not a STALE registration left
 * behind after an import is deleted — a dormant licence for that capability to be picked up
 * again without review. Same two-way-parity argument as `compareFacadeImports`.
 *
 * `observedEdges` is an iterable of { importerKey, normalizedSpecifier } over ALL of src/.
 * Results keep registered order so checker output is stable.
 */
export function findStaleImporterPermissions({ targets, observedEdges }) {
  const observed = new Set();
  for (const { importerKey, normalizedSpecifier } of observedEdges) {
    observed.add(`${normalizedSpecifier} ${importerKey}`);
  }

  return Object.entries(targets).flatMap(([target, { allowedImporters }]) =>
    [...allowedImporters]
      .filter((importer) => !observed.has(`${target} ${importer}`))
      .map((importer) => ({ target, importer })),
  );
}

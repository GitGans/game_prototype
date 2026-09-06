// Closes a MODULE's public surface, the way state-ownership-policy.mjs closes a CLASS's.
//
// RESTRICTED_IMPORT_TARGETS controls who may PICK UP a restricted capability. Nothing there
// controls what a permitted holder may HAND ON: battleRuntimeAccess is legitimately allowed to
// import battleRuntimeStorage, so `export { writeBattleRuntimeSlot } from './battleRuntimeStorage'`
// hands the write capability to every importer of the read gateway while the import checker
// stays green. This module closes that direction.
//
// Only two declaration forms are approvable: a named `export function` WITH A BODY, and a named
// `export type`. Everything else is rejected rather than analysed — an export list is exactly
// how a capability gets forwarded, and no name allowlist can bound `export *`. The four
// protected modules need nothing else.
//
// SCOPE: this pins the SURFACE. It does not inspect function bodies and makes no claim about
// what an already-approved function passes through; that would need data-flow analysis.
//
// Pure: no fs, no process access. scripts/check-boundaries.mjs reads the source and formats the
// diagnostics; the tests drive these functions with the real sources and with synthetic ones.

import ts from "typescript";
import { hasModifier } from "./ts-class-members.mjs";

const SUPPORTED_KINDS = new Set(["function", "type-alias"]);
const ENTRY_FIELDS = new Set(["name", "kind"]);

/**
 * Structural validation of the registry itself. Returns problems; [] means well-formed.
 *
 * `requiredFileKeys` is the coverage obligation: every module holding restricted authority
 * must carry a reviewed surface, so a new restricted capability cannot exist unpinned.
 *
 * As in restricted-import-targets.mjs, structural validity is established BEFORE any value is
 * interpolated — template interpolation of a Symbol throws, which would break fail-closed.
 */
export function validateModuleExportPolicies(registry, requiredFileKeys = []) {
  if (registry === null || typeof registry !== "object" || Array.isArray(registry)) {
    return [
      "RUNTIME_OWNERSHIP_EXPORT_POLICIES must be a plain object keyed by src-relative file",
    ];
  }

  const problems = [];

  for (const [fileKey, entries] of Object.entries(registry)) {
    // Keys are compared literally against the src/ file walk, so an extensionless key would
    // silently target nothing — a surface that quietly stops being pinned.
    if (!fileKey.endsWith(".ts") && !fileKey.endsWith(".tsx")) {
      problems.push(`export-policy key "${fileKey}" must carry a .ts/.tsx extension`);
      continue;
    }

    if (!Array.isArray(entries)) {
      problems.push(`export-policy "${fileKey}" must be an array of { name, kind } entries`);
      continue;
    }

    const seen = new Set();

    entries.forEach((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        problems.push(`export-policy "${fileKey}" entry ${index} must be an object`);
        return;
      }

      for (const field of Object.keys(entry)) {
        if (!ENTRY_FIELDS.has(field)) {
          problems.push(`export-policy "${fileKey}" entry ${index} has unknown field "${field}"`);
        }
      }

      if (typeof entry.name !== "string" || entry.name.trim() === "") {
        problems.push(`export-policy "${fileKey}" entry ${index} needs a non-empty name`);
        return;
      }

      if (!SUPPORTED_KINDS.has(entry.kind)) {
        // typeof only — the value is unvalidated and must never be interpolated.
        problems.push(
          `export-policy "${fileKey}" entry "${entry.name}" has unsupported kind ` +
            `(${typeof entry.kind}); expected one of ${[...SUPPORTED_KINDS].join(", ")}`,
        );
        return;
      }

      if (seen.has(entry.name)) {
        problems.push(`export-policy "${fileKey}" registers "${entry.name}" twice`);
      }
      seen.add(entry.name);
    });
  }

  for (const fileKey of requiredFileKeys) {
    if (!Object.hasOwn(registry, fileKey)) {
      problems.push(
        `"${fileKey}" holds restricted battle-runtime authority but has no reviewed export ` +
          `surface — add one to RUNTIME_OWNERSHIP_EXPORT_POLICIES`,
      );
    }
  }

  return problems;
}

/**
 * Compiles once at module scope. Never throws: a malformed registry yields problems AND an
 * empty policy set, so the checker reports the malformation instead of silently enforcing a
 * partially valid policy.
 */
export function compileModuleExportPolicies(registry, requiredFileKeys = []) {
  const problems = validateModuleExportPolicies(registry, requiredFileKeys);
  if (problems.length > 0) return { problems, policies: {} };
  return { problems, policies: registry };
}

/**
 * Returns human-readable problems; [] means the module's surface matches the registry exactly.
 *
 * Fails closed on:
 *   - unparseable source (an error-tolerant parse would otherwise read as "no exports");
 *   - every export declaration, export assignment, default export and `export as namespace`;
 *   - every unsupported declaration form;
 *   - an unregistered export;
 *   - a stale registration, whose dormant permission would let a removed export return;
 *   - a declaration-kind change (a type export becoming a runtime value);
 *   - a duplicate discovered name.
 *
 * A rejected export FORM is not recorded as a discovered name, so a forbidden alias wearing an
 * approved name correctly yields two diagnostics: the forbidden form, and the approved name now
 * missing. Both are true and both are wanted.
 */
export function evaluateModuleExportPolicy({
  sourceText,
  fileName,
  expectedExports,
  registryName = "RUNTIME_OWNERSHIP_EXPORT_POLICIES",
}) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const parseProblems = readParseProblems(sourceFile);
  if (parseProblems.length > 0) return parseProblems;

  const lineOf = (node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const problems = [];
  const discovered = [];

  for (const statement of sourceFile.statements) {
    const line = lineOf(statement);

    // `export { x }`, `export { x } from './m'`, `export { x as y } from './m'`, `export * ...`
    // — one node kind, all rejected. This is the forwarding gap: an alias wearing an approved
    // name would otherwise satisfy any name-only comparison.
    if (ts.isExportDeclaration(statement)) {
      problems.push(
        `line ${line}: export declaration — re-exports, aliases, export lists and \`export *\` ` +
          `may forward a restricted capability; declare the export here instead`,
      );
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      problems.push(
        `line ${line}: ${statement.isExportEquals ? "`export =`" : "default export"} — only ` +
          `named function and type-alias exports are approvable`,
      );
      continue;
    }

    // `export as namespace Foo;` — a top-level export form carrying NO export modifier, so it
    // would slip past the modifier check below and leave this scan not fail-closed.
    if (ts.isNamespaceExportDeclaration(statement)) {
      problems.push(
        `line ${line}: \`export as namespace\` — a UMD global export is not an approvable surface`,
      );
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;

    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      problems.push(`line ${line}: default export — only named exports are approvable`);
      continue;
    }

    const kind = classifyExportedDeclaration(statement);
    if (kind === null) {
      problems.push(
        `line ${line}: unsupported exported ${describeForm(statement)} — only named function ` +
          `declarations (with a body) and type aliases are approvable`,
      );
      continue;
    }

    const name =
      statement.name !== undefined && ts.isIdentifier(statement.name)
        ? statement.name.text
        : null;

    if (name === null) {
      problems.push(`line ${line}: unnamed exported declaration — an allowlist cannot bound it`);
      continue;
    }

    discovered.push({ name, kind, line });
  }

  const seen = new Map();

  for (const item of discovered) {
    if (seen.has(item.name)) {
      problems.push(`line ${item.line}: duplicate exported name "${item.name}"`);
      continue;
    }
    seen.set(item.name, item);
  }

  const expectedByName = new Map(expectedExports.map((entry) => [entry.name, entry.kind]));

  for (const item of seen.values()) {
    const expectedKind = expectedByName.get(item.name);

    if (expectedKind === undefined) {
      problems.push(
        `line ${item.line}: unregistered export "${item.name}" (${item.kind}) — add it to ` +
          `${registryName} or remove it`,
      );
    } else if (expectedKind !== item.kind) {
      problems.push(
        `line ${item.line}: export "${item.name}" is a ${item.kind}, registered as ` +
          `${expectedKind} — a type export becoming a runtime value is a new capability`,
      );
    }
  }

  for (const entry of expectedExports) {
    if (!seen.has(entry.name)) {
      problems.push(
        `stale ${registryName} entry "${entry.name}" — no such export; remove it rather than ` +
          `leaving a dormant permission`,
      );
    }
  }

  return problems;
}

// `body !== undefined` rejects ambient declarations (`export declare function f(): void;`) —
// the shape a re-export takes when written as an ambient signature — and overload signatures,
// which would otherwise arrive as a duplicate name. Neither is used by the protected modules,
// so rejecting costs nothing and removes an ambiguity from the check.
function classifyExportedDeclaration(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) return "function";
  if (ts.isTypeAliasDeclaration(statement)) return "type-alias";
  return null;
}

function describeForm(statement) {
  if (ts.isVariableStatement(statement)) return "variable";
  if (ts.isFunctionDeclaration(statement)) return "ambient/overload function declaration";
  if (ts.isClassDeclaration(statement)) return "class";
  if (ts.isInterfaceDeclaration(statement)) return "interface";
  if (ts.isEnumDeclaration(statement)) return "enum";
  if (ts.isModuleDeclaration(statement)) return "namespace";
  return "declaration";
}

// `parseDiagnostics` is not in TypeScript's public typings, but createSourceFile's parser is
// error-tolerant: it recovers silently, so a broken file yields a truncated statement list and
// would pass vacuously. Verified present and populated on the pinned typescript@^5.4.0.
// A missing/non-array value is treated as a VIOLATION, not as "clean" — if a future TypeScript
// drops the property this fails loudly instead of quietly enforcing nothing.
//
// Exported for scripts/state-store-forwarding-policy.mjs, which parses the same sources and needs
// the same fail-closed behaviour: two implementations that disagreed about a broken file would be
// exactly the fail-open case this helper exists to prevent.
export function readParseProblems(sourceFile) {
  const diagnostics = sourceFile.parseDiagnostics;

  if (!Array.isArray(diagnostics)) {
    return ["TypeScript parse diagnostics unavailable — export surface cannot be enforced"];
  }

  return diagnostics.map((diagnostic) => {
    const line = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
    return `line ${line}: parse error — ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
  });
}

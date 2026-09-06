// Direct forwarding of a restricted STATE STORE (core/GameState, core/playerSessionStore).
//
// RESTRICTED_IMPORT_TARGETS controls who may PICK a store up. Nothing there stops a PERMITTED
// holder from handing it on: `export { GameState } from './GameState'` inside campaignLifecycle
// hands the campaign mutation capability to every importer of campaignLifecycle while the import
// checker stays green, precisely because campaignLifecycle is an approved importer.
//
// This closes that direction WITHOUT pinning the module's whole surface — see
// STATE_STORE_RESTRICTED_TARGETS in scripts/orchestration-boundary-rules.mjs for why a pinned
// surface is both the wrong tool and an impossible one for these two modules.
//
// SCOPE, deliberately shallow: DIRECT imports and DIRECT re-exports only. A function that uses a
// store internally and returns purpose-built data is allowed and is not analysed. Returned values,
// wrapper functions, object literals, property assignments and transitive call chains are out of
// scope — tracing them needs data-flow analysis, which is explicitly not part of this policy.
//
// One form is rejected OUTRIGHT rather than checked for forwarding: `import('./GameState')`.
// scripts/import-scanner.mjs already counts a dynamic import as a dependency, so the inbound
// allowlist catches an unapproved module using one — but an APPROVED importer could write
// `export const stateModule = import('./GameState')` and hand the capability on as a promise that
// binds no local name and so appears in no statement-level scan. Neither store has any reason to be
// loaded dynamically and none of the current owners does, so banning the form closes that hole
// exactly, with no data-flow analysis and no production change.
//
// Pure: no fs, no process access. scripts/check-boundaries.mjs reads the sources, owns specifier
// normalization and formats the diagnostics; the tests drive this function with synthetic sources
// and with the real ones.

import ts from "typescript";
import { readParseProblems } from "./module-export-policy.mjs";

/**
 * Returns human-readable problems; [] means the module forwards nothing.
 *
 * `isRestrictedSpecifier(rawSpecifier)` is supplied by the caller, which owns normalization: the
 * same rule must catch './GameState' from core/ and '../GameState' from core/phaseHandlers/.
 *
 * Fails closed on unparseable source — an error-tolerant parse yields a truncated statement list
 * that would otherwise read as "forwards nothing".
 */
export function evaluateStateStoreForwarding({ sourceText, fileName, isRestrictedSpecifier }) {
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

  // ── Pass 1: local names bound to a restricted store, in every static import form ──────────
  //   import { GameState }          → GameState
  //   import { GameState as Store } → Store
  //   import Store from …           → Store
  //   import * as Store from …      → Store
  const storeBindings = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isRestrictedSpecifier(statement.moduleSpecifier.text)) continue;

    const clause = statement.importClause;
    if (clause === undefined) continue; // side-effect import: binds nothing
    if (clause.name !== undefined) storeBindings.add(clause.name.text);

    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) storeBindings.add(bindings.name.text);
    else for (const element of bindings.elements) storeBindings.add(element.name.text);
  }

  const problems = [];

  // ── Pass 2: dynamic import of a store, ANYWHERE in the tree ──────────────────────────────
  // Not just at statement level: the whole point of the form is that it can sit inside an
  // initializer, a return statement or a call argument, binding no name the export scan can see.
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      isRestrictedSpecifier(node.arguments[0].text)
    ) {
      problems.push(
        `line ${lineOf(node)}: dynamic import of a restricted state store ` +
          `("${node.arguments[0].text}") — the module object it resolves to is the capability ` +
          `itself and can be exported without binding a name; use a static import`,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // ── Pass 3: the four direct forwarding forms ─────────────────────────────────────────────
  for (const statement of sourceFile.statements) {
    const line = lineOf(statement);

    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;

      // `export { x } from './GameState'`, `export * from …`, `export * as ns from …`
      if (specifier !== undefined) {
        if (ts.isStringLiteral(specifier) && isRestrictedSpecifier(specifier.text)) {
          problems.push(
            `line ${line}: re-export from a restricted state store ("${specifier.text}") — the ` +
              `store capability may not be forwarded; expose a purpose-built operation instead`,
          );
        }
        continue;
      }

      // `export { GameState }` / `export { GameState as State }` over a locally imported binding.
      if (statement.exportClause === undefined) continue;
      if (!ts.isNamedExports(statement.exportClause)) continue;

      for (const element of statement.exportClause.elements) {
        const local = (element.propertyName ?? element.name).text;
        if (!storeBindings.has(local)) continue;

        problems.push(
          `line ${line}: export list forwards the restricted store binding "${local}" as ` +
            `"${element.name.text}" — expose a purpose-built operation instead`,
        );
      }
      continue;
    }

    // `export default GameState` / `export = GameState`
    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (ts.isIdentifier(expression) && storeBindings.has(expression.text)) {
        problems.push(
          `line ${line}: ${statement.isExportEquals ? "`export =`" : "default export"} forwards ` +
            `the restricted store binding "${expression.text}"`,
        );
      }
      continue;
    }

    // `export const State = GameState` — an alias is a re-export in variable clothing, and an
    // initializer that IS the identifier needs no data-flow analysis to see. An initializer that
    // is a call, an object literal or a property access is deliberately not analysed.
    if (ts.isVariableStatement(statement)) {
      if (!hasExportModifier(statement)) continue;

      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (initializer === undefined) continue;
        if (!ts.isIdentifier(initializer)) continue;
        if (!storeBindings.has(initializer.text)) continue;

        problems.push(
          `line ${lineOf(declaration)}: exported alias of the restricted store binding ` +
            `"${initializer.text}" — expose a purpose-built operation instead`,
        );
      }
    }
  }

  // Pass 2 walks the whole tree and pass 3 the statement list, so problems arrive out of order.
  return problems.sort((a, b) => parseLine(a) - parseLine(b));
}

const parseLine = (problem) => Number(problem.match(/^line (\d+):/)?.[1] ?? 0);

const hasExportModifier = (node) =>
  (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

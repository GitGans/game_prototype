// ONE interpretation of TypeScript class syntax, shared by every class-shaped source policy.
//
// Extracted from phase-manager-policy.mjs, which had this walk hardcoded to PhaseManagerClass.
// A second, independently-written walker would be a second answer to "what counts as a declared
// member", and the two could disagree — the same hazard scripts/import-specifier.mjs was
// extracted to prevent for import normalization.

import ts from "typescript";

export const modifiersOf = (node) =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? [];

export const hasModifier = (node, kind) =>
  modifiersOf(node).some((modifier) => modifier.kind === kind);

export const isNonPublic = (node) =>
  hasModifier(node, ts.SyntaxKind.PrivateKeyword) ||
  hasModifier(node, ts.SyntaxKind.ProtectedKeyword);

/**
 * Classifies a member's name.
 * → { kind: 'named' | 'ecma-private' | 'computed' | 'unnamed', name? }
 */
export function describeName(nameNode) {
  if (nameNode === undefined) return { kind: "unnamed" };
  if (ts.isPrivateIdentifier(nameNode)) return { kind: "ecma-private" };
  if (ts.isComputedPropertyName(nameNode)) return { kind: "computed" };
  if (
    ts.isIdentifier(nameNode) ||
    ts.isStringLiteral(nameNode) ||
    ts.isNumericLiteral(nameNode)
  ) {
    return { kind: "named", name: nameNode.text };
  }
  return { kind: "unnamed" };
}

/**
 * Every member of `className`, classified.
 *
 * Returns { found, members }, where each member is
 *   { form, name, isPublic, isStatic, line, node }
 * and `form` is one of:
 *   'field' | 'method' | 'getter' | 'setter' | 'index-signature'
 *   | 'parameter-property' | 'constructor'
 *
 * `found: false` means the class is absent (renamed, moved, deleted). Callers MUST treat that
 * as a violation — it is what makes every class-shaped policy fail closed.
 *
 * Index signatures, computed members and ECMA-private members are RETURNED, not skipped, so a
 * policy can reject them explicitly instead of a name-matching allowlist letting them through
 * silently: `[key: string]: unknown` widens a class surface to everything while exposing no
 * named member.
 *
 * A constructor parameter property (`constructor(private readonly x: T)`) is a field
 * declaration in different syntax and is reported as 'parameter-property'. A plain parameter
 * carries no modifier and declares no member, so it is omitted — that distinction is what
 * keeps `constructor(deps: D)` legal while `constructor(readonly deps: D)` is a member.
 */
export function findClassMembers(sourceText, { className, fileName = "source.ts" }) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const members = [];
  let found = false;

  const lineOf = (node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const push = (node, form, nameNode) =>
    members.push({
      form,
      name: describeName(nameNode),
      isPublic: !isNonPublic(node),
      isStatic: hasModifier(node, ts.SyntaxKind.StaticKeyword),
      line: lineOf(node),
      node,
    });

  function visitClassMembers(classNode) {
    found = true;

    for (const member of classNode.members) {
      if (ts.isConstructorDeclaration(member)) {
        push(member, "constructor", member.name);

        for (const parameter of member.parameters) {
          if (modifiersOf(parameter).length === 0) continue;
          push(parameter, "parameter-property", parameter.name);
        }
        continue;
      }

      // An index signature has no name but is fully public API. `private`/`protected` on one
      // is a TYPE error, but createSourceFile does no type checking and parses it fine — so it
      // goes through the same uniform visibility read as everything else, with no special branch
      // that could drift.
      if (ts.isIndexSignatureDeclaration(member)) {
        push(member, "index-signature", undefined);
        continue;
      }

      if (ts.isPropertyDeclaration(member)) push(member, "field", member.name);
      else if (ts.isMethodDeclaration(member)) push(member, "method", member.name);
      else if (ts.isGetAccessorDeclaration(member)) push(member, "getter", member.name);
      else if (ts.isSetAccessorDeclaration(member)) push(member, "setter", member.name);
      // Static blocks and stray semicolons expose no instance or static API member.
    }
  }

  function visit(node) {
    if (
      (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.name !== undefined &&
      node.name.text === className
    ) {
      visitClassMembers(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { found, members };
}

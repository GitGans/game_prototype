import ts from "typescript";

/**
 * Находит чтение discriminator `type`.
 * PhaseManager не должен принимать domain-routing решения, поэтому любое
 * runtime-чтение `.type`, `["type"]` или destructuring `{ type }` запрещено.
 */
export function findPhaseManagerTypeDiscriminatorReads(sourceText) {
  const sourceFile = ts.createSourceFile(
    "PhaseManager.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const violations = [];

  function addViolation(node, form) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    violations.push({
      line: line + 1,
      form,
    });
  }

  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "type") {
      addViolation(node, ".type");
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "type"
    ) {
      addViolation(node, '["type"]');
    }

    if (ts.isBindingElement(node)) {
      const readsNamedType =
        (node.propertyName &&
          ts.isIdentifier(node.propertyName) &&
          node.propertyName.text === "type") ||
        (!node.propertyName &&
          ts.isIdentifier(node.name) &&
          node.name.text === "type");

      if (readsNamedType) {
        addViolation(node, "{ type }");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const PHASE_MANAGER_CLASS_NAME = "PhaseManagerClass";

const modifiersOf = (node) =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? [];

const hasModifier = (node, kind) => modifiersOf(node).some((m) => m.kind === kind);

const isNonPublic = (node) =>
  hasModifier(node, ts.SyntaxKind.PrivateKeyword) ||
  hasModifier(node, ts.SyntaxKind.ProtectedKeyword);

/**
 * Публичные члены PhaseManagerClass, сверенные с явным allowlist.
 *
 * Fails CLOSED. A computed name, an unnameable member, a public INDEX SIGNATURE, or a missing
 * PhaseManagerClass declaration is REPORTED rather than skipped: `[key: string]: unknown`
 * widens the class surface to everything while exposing no named member, so ignoring index
 * signatures would leave the allowlist trivially bypassable.
 */
export function findPhaseManagerPublicApiViolations(sourceText, allowedMembers) {
  const sourceFile = ts.createSourceFile(
    "PhaseManager.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const allowed = new Set(allowedMembers);
  const violations = [];
  let sawClass = false;

  const lineOf = (node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const report = (node, name, form) => violations.push({ line: lineOf(node), name, form });

  // → { kind: 'named' | 'ecma-private' | 'computed' | 'unnamed', name? }
  function describeName(nameNode) {
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

  function checkMember(node, form) {
    if (isNonPublic(node)) return;

    const described = describeName(node.name);
    if (described.kind === "ecma-private") return; // #x is not public by construction
    if (described.kind === "named") {
      if (allowed.has(described.name)) return;
      report(node, described.name, form);
      return;
    }

    report(node, `<${described.kind}>`, form); // fail closed
  }

  function visitClassMembers(classNode) {
    sawClass = true;

    for (const member of classNode.members) {
      if (ts.isConstructorDeclaration(member)) {
        // The constructor itself is always allowed — dependency injection requires it. Its
        // PARAMETER PROPERTIES are still class members and are still checked. A plain
        // parameter carries no modifier and declares no member, so it is skipped: that is the
        // distinction making `constructor(deps: D)` legal while `constructor(readonly deps: D)`
        // is a violation.
        for (const parameter of member.parameters) {
          if (modifiersOf(parameter).length === 0) continue;
          checkMember(parameter, "constructor parameter property");
        }
        continue;
      }

      // An index signature has no name but is fully public API. Gate it on the same
      // private/protected check as everything else and report it by form. (`private`/
      // `protected` on an index signature is a TYPE error, but createSourceFile does no type
      // checking and parses it fine — one uniform rule, no branch that could drift.)
      if (ts.isIndexSignatureDeclaration(member)) {
        if (!isNonPublic(member)) report(member, "<index signature>", "index signature");
        continue;
      }

      const staticPrefix = hasModifier(member, ts.SyntaxKind.StaticKeyword) ? "static " : "";

      if (ts.isPropertyDeclaration(member)) checkMember(member, `${staticPrefix}field`);
      else if (ts.isMethodDeclaration(member)) checkMember(member, `${staticPrefix}method`);
      else if (ts.isGetAccessorDeclaration(member)) checkMember(member, `${staticPrefix}getter`);
      else if (ts.isSetAccessorDeclaration(member)) checkMember(member, `${staticPrefix}setter`);
      // Static blocks and stray semicolons expose no instance or static API member.
    }
  }

  function visit(node) {
    if (
      (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.name !== undefined &&
      node.name.text === PHASE_MANAGER_CLASS_NAME
    ) {
      visitClassMembers(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!sawClass) {
    violations.push({
      line: 1,
      name: PHASE_MANAGER_CLASS_NAME,
      form: "class declaration not found",
    });
  }

  return violations;
}

/**
 * The complete PhaseManager source policy: the coordinator discriminator ban plus the public
 * API allowlist, combined into ONE function so `check-boundaries.mjs` and the unit tests
 * exercise the same composition. A future PhaseManager source rule added here is wired into
 * the checker for free, instead of needing a second call site that could be forgotten.
 */
export function evaluatePhaseManagerPolicy({ sourceText, allowedPublicMembers }) {
  return [
    ...findPhaseManagerTypeDiscriminatorReads(sourceText).map((violation) => ({
      line: violation.line,
      rule: "PhaseManager coordinator",
      message: `must not read ${violation.form}`,
    })),
    ...findPhaseManagerPublicApiViolations(sourceText, allowedPublicMembers).map((violation) => ({
      line: violation.line,
      rule: "PhaseManager public API",
      message:
        `undeclared public ${violation.form} "${violation.name}" ` +
        `— allowed: ${allowedPublicMembers.join(", ")}`,
    })),
  ];
}

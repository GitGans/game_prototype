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

import ts from "typescript";
import { findClassMembers } from "./ts-class-members.mjs";

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

/**
 * Публичные члены PhaseManagerClass, сверенные с явным allowlist.
 *
 * Fails CLOSED. A computed name, an unnameable member, a public INDEX SIGNATURE, or a missing
 * PhaseManagerClass declaration is REPORTED rather than skipped: `[key: string]: unknown`
 * widens the class surface to everything while exposing no named member, so ignoring index
 * signatures would leave the allowlist trivially bypassable.
 *
 * Member discovery is delegated to scripts/ts-class-members.mjs, shared with the GameState
 * ownership policy, so both read TypeScript class syntax the same way. The form LABELS below
 * are this policy's own presentation of that shared classification.
 */
export function findPhaseManagerPublicApiViolations(sourceText, allowedMembers) {
  const { found, members } = findClassMembers(sourceText, {
    className: PHASE_MANAGER_CLASS_NAME,
    fileName: "PhaseManager.ts",
  });

  const allowed = new Set(allowedMembers);
  const violations = [];

  const label = (member) => {
    if (member.form === "index-signature") return "index signature";
    if (member.form === "parameter-property") return "constructor parameter property";
    return `${member.isStatic ? "static " : ""}${member.form}`;
  };

  for (const member of members) {
    // The constructor itself is always allowed — dependency injection requires it. Its
    // PARAMETER PROPERTIES are separate members and are still checked.
    if (member.form === "constructor") continue;
    if (!member.isPublic) continue;
    if (member.name.kind === "ecma-private") continue; // #x is not public by construction

    if (member.name.kind === "named") {
      if (allowed.has(member.name.name)) continue;
      violations.push({ line: member.line, name: member.name.name, form: label(member) });
      continue;
    }

    violations.push({
      line: member.line,
      name: member.form === "index-signature" ? "<index signature>" : `<${member.name.kind}>`,
      form: label(member),
    }); // fail closed
  }

  if (!found) {
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

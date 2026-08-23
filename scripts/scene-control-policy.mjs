// AST-based Phaser scene-control scanner. Detects calls to scene-control
// methods (start/stop/launch/switch/restart/run/sleep/wake/pause/resume) made
// directly through a `.scene` accessor or a one-level, lexically-scoped alias
// of one, then evaluates them against a SCENE_CONTROL_POLICY entry.

import ts from "typescript";

const CONTROL_METHODS = new Set([
  "start",
  "stop",
  "launch",
  "switch",
  "restart",
  "run",
  "sleep",
  "wake",
  "pause",
  "resume",
]);
// Phaser signature: () — no arguments at all.
const NO_ARGS_METHODS = new Set(["restart"]);

// Reads the accessed property name from either `obj.name` or `obj["name"]`.
function propertyNameOf(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function objectExpressionOf(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ? node.expression
    : null;
}

function isSceneAccess(node) {
  return propertyNameOf(node) === "scene";
}

function isScopeBoundary(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isBlock(node) ||
    // A for(...)'s declared loop variable, a catch clause's parameter, and an
    // unbraced switch case's local declarations must each get their own frame
    // — otherwise, since visit() only pushes a new Map when isScopeBoundary()
    // is true, their bindings would be recorded into the *same* Map object as
    // the enclosing scope and permanently overwrite a same-named outer alias,
    // hiding real scene-control calls made after the loop/catch/switch.
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node)
  );
}

export function findSceneControlCalls(sourceText, fileName = "scene.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function lineOf(node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  // Nearest binding wins — a shadowing non-alias declaration must be visible
  // to the lookup, not merely absent from it.
  function resolveAlias(scopeStack, name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return scopeStack[i].get(name);
    }
    return false;
  }

  function visit(node, scopeStack) {
    const nextStack = isScopeBoundary(node) ? [...scopeStack, new Map()] : scopeStack;
    const currentScope = nextStack[nextStack.length - 1];

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const isAlias = !!node.initializer && isSceneAccess(node.initializer);
      currentScope.set(node.name.text, isAlias);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      currentScope.set(node.name.text, false);
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const method = propertyNameOf(callee);
      const object = objectExpressionOf(callee);

      if (method && CONTROL_METHODS.has(method) && object) {
        const isDirect = isSceneAccess(object);
        const isAlias = ts.isIdentifier(object) && resolveAlias(nextStack, object.text);

        if (isDirect || isAlias) {
          const firstArg = node.arguments[0];
          violations.push({
            line: lineOf(node),
            method,
            argCount: node.arguments.length,
            literalArg: firstArg && ts.isStringLiteralLike(firstArg) ? firstArg.text : null,
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, nextStack));
  }

  visit(sourceFile, [new Map()]);
  return violations;
}

// Applies one SCENE_CONTROL_POLICY entry to one file's raw
// findSceneControlCalls() output. `policy` is undefined/null (nothing
// permitted), `{ calls: [...] }` (exact bootstrap edges), or
// `{ methods: [...] }` (any target, arg-count rules only).
export function evaluateSceneControlCalls(calls, policy) {
  const problems = [];

  if (!policy) {
    for (const call of calls) {
      problems.push({ line: call.line, method: call.method, reason: "not permitted in this file" });
    }
    return problems;
  }

  if (policy.calls) {
    const seenCounts = new Map();
    for (const call of calls) {
      const expected = policy.calls.find(
        (entry) => entry.method === call.method && entry.target === call.literalArg,
      );
      if (!expected || call.argCount !== 1) {
        const allowed = policy.calls.map((e) => `${e.method}("${e.target}")`).join(", ");
        problems.push({ line: call.line, method: call.method, reason: `only ${allowed} is permitted here` });
        continue;
      }
      const seen = (seenCounts.get(expected) ?? 0) + 1;
      seenCounts.set(expected, seen);
      if (seen > 1) {
        problems.push({
          line: call.line,
          method: call.method,
          reason: `duplicate call — only one ${call.method}("${expected.target}") is permitted`,
        });
      }
    }
    return problems;
  }

  for (const call of calls) {
    if (!policy.methods.includes(call.method)) {
      problems.push({ line: call.line, method: call.method, reason: "not permitted in this file" });
    } else if (NO_ARGS_METHODS.has(call.method) && call.argCount > 0) {
      problems.push({ line: call.line, method: call.method, reason: "must not receive any arguments" });
    } else if (!NO_ARGS_METHODS.has(call.method) && call.argCount !== 1) {
      problems.push({ line: call.line, method: call.method, reason: "must receive exactly one scene-key argument" });
    }
  }
  return problems;
}

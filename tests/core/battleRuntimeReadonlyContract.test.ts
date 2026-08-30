// Stage 4B read-boundary regression contract.
//
// Vitest transpiles tests with esbuild and performs no semantic type checking, and
// tsconfig.json covers only `src`. So the contract must invoke tsc programmatically:
// it compiles the real project plus tests/type-contracts/battleRuntimeReadonly.contract.ts
// and asserts zero diagnostics.
//
// Two failure modes, both collected by getPreEmitDiagnostics:
//   - a runtime-owned record property loses `readonly` → TS2344, naming that property
//   - an owned collection regains mutability → TS2578, unused '@ts-expect-error'
//
// Do not replace this with source-text matching or an AST list of readonly fields. The
// compiler must verify the actual public type returned by requireBattleRuntimeForPhase().
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = path.join(REPO_ROOT, 'tests/type-contracts/battleRuntimeReadonly.contract.ts');

describe('battle runtime read boundary', () => {
  it('exposes no writable runtime-owned path through requireBattleRuntimeForPhase()', () => {
    const configPath = path.join(REPO_ROOT, 'tsconfig.json');
    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(raw.error, 'tsconfig.json must be readable').toBeUndefined();

    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, REPO_ROOT);
    expect(parsed.errors.filter(d => d.category === ts.DiagnosticCategory.Error)).toHaveLength(0);

    const program = ts.createProgram({
      // The fixture is outside `include: ["src"]`, so it is added explicitly.
      rootNames: [...parsed.fileNames, FIXTURE],
      options: {
        ...parsed.options,
        // rootDir is "src" in the checked-in config; widen it so the external fixture
        // is a valid program input. noEmit makes outDir irrelevant.
        rootDir: REPO_ROOT,
        noEmit: true,
      },
    });

    // Without this, a fixture silently dropped from the program would yield zero
    // diagnostics — a passing test that verifies nothing.
    expect(
      program.getSourceFile(FIXTURE),
      'readonly contract fixture must be part of the TypeScript program',
    ).toBeDefined();

    const diagnostics = ts.getPreEmitDiagnostics(program);
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: f => f,
      getCurrentDirectory: () => REPO_ROOT,
      getNewLine: () => ts.sys.newLine,
    });

    expect(diagnostics.length, formatted).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tooling module, intentionally untyped
import { findImports } from '../../scripts/import-scanner.mjs';

// Guards the architecture-enforcement contract: every module dependency form
// that check-boundaries.mjs must validate. A form missing here is a form a
// pure module could use to bypass its boundary rule while the checker still
// reports success.
describe('findImports', () => {
  it('detects side-effect imports in both quote styles', () => {
    const content = [
      "import './GameState';",
      'import "../campaign";',
    ].join('\n');

    expect([...findImports(content)]).toEqual([
      { spec: './GameState', line: 1 },
      { spec: '../campaign', line: 2 },
    ]);
  });

  it('detects a side-effect import wrapped onto the next line', () => {
    expect([...findImports("import\n  './GameState';")])
      .toEqual([{ spec: './GameState', line: 1 }]);
  });

  it('still detects ordinary, multiline, re-export and dynamic imports in source order', () => {
    const content = [
      "import { a } from './ordinary';",   // 1
      'import {',                          // 2
      '  b,',                              // 3
      "} from './multiline';",             // 4
      "export { c } from './reexport';",   // 5
      "const m = import('./dynamic');",    // 6
    ].join('\n');

    // The multiline statement reports its opening line (2), not the line
    // carrying the specifier (4) — the match starts at the `import` keyword.
    expect([...findImports(content)]).toEqual([
      { spec: './ordinary',  line: 1 },
      { spec: './multiline', line: 2 },
      { spec: './reexport',  line: 5 },
      { spec: './dynamic',   line: 6 },
    ]);
  });

  it('reports each specifier exactly once', () => {
    const content = [
      "import { value } from './ordinary';",
      "import './side-effect';",
    ].join('\n');

    const specs = [...findImports(content)].map((i: { spec: string }) => i.spec);
    expect(specs).toEqual(['./ordinary', './side-effect']);
  });
});

// Pure import-specifier normalization, shared by scripts/check-boundaries.mjs and by the
// tests that enforce the same rules. Extracted from check-boundaries.mjs so no consumer can
// re-implement it: two normalizations that disagree about one import would let a test pass
// while the checker fails, or the reverse.
//
// Relative specifiers are resolved against the importing file and expressed src-relative with
// posix separators, so every rule uses one vocabulary:
//   './GameState'        from src/core/x.ts    → core/GameState
//   '../campaign'        from src/core/x.ts    → campaign
//   '../../battle/types' from src/core/a/b.ts  → battle/types
// Bare package specifiers ('phaser', 'vitest') pass through unchanged.

import { relative, dirname, resolve, sep } from "path";

export function normalizeSpecifier({ srcRoot, importerFile, specifier }) {
  if (!specifier.startsWith(".")) return specifier;

  return relative(srcRoot, resolve(dirname(importerFile), specifier))
    .split(sep)
    .join("/");
}

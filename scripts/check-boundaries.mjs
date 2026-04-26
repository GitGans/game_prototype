#!/usr/bin/env node
// Boundary checker — Step 1 foundation rules.
// Run: node scripts/check-boundaries.mjs
// Full battle→core enforcement added in Step 3.
//
// Catches both `import ... from 'x'` and `export ... from 'x'` patterns.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = new URL('../src', import.meta.url).pathname;
const errors = [];

function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { yield* walkFiles(full); continue; }
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
    yield [full, readFileSync(full, 'utf8')];
  }
}

const RULES = [
  {
    layer: 'shared/**',
    dir: join(SRC, 'shared'),
    banned: ['battle/', 'core/', 'data/', 'objects/', 'scenes/', 'ui/', 'world/'],
  },
  {
    layer: 'data/**',
    dir: join(SRC, 'data'),
    // data/ → shared/ is explicitly allowed
    banned: ['battle/', 'core/', 'objects/', 'scenes/', 'ui/', 'world/'],
  },
  {
    layer: 'battle/**',
    dir: join(SRC, 'battle'),
    banned: ['core/'],
  },
];

// Matches both `import ... from 'x'` and `export ... from 'x'`
const FROM_RE = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g;

for (const { layer, dir, banned } of RULES) {
  for (const [file, content] of walkFiles(dir)) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      let m;
      FROM_RE.lastIndex = 0;
      while ((m = FROM_RE.exec(line)) !== null) {
        const imp = m[1];
        for (const b of banned) {
          if (imp.includes(b)) {
            const rel = relative(SRC, file);
            errors.push(`  ${rel}:${i + 1}  [${layer}] imports from ${b}  →  "${imp}"`);
          }
        }
      }
    });
  }
}

if (errors.length > 0) {
  console.error('Boundary violations found:\n');
  errors.forEach(e => console.error(e));
  process.exit(1);
} else {
  console.log('✓ All boundaries clean (Step 1 foundation rules)');
}

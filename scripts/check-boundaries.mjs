#!/usr/bin/env node
// Boundary checker.
// Run: node scripts/check-boundaries.mjs
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
  {
    layer: 'ui/**',
    dir: join(SRC, 'ui'),
    // core/Constants (LAYOUT_SCALE) is explicitly allowed
    banned: ['core/GameState', 'core/PhaseManager', 'core/EventBus', 'objects/', 'scenes/', 'battle/', 'world/'],
  },
  {
    layer: 'objects/**',
    dir: join(SRC, 'objects'),
    // core/Constants, core/phases, core/unitSpriteKey, battle/types, battle/combat are allowed
    banned: ['core/GameState', 'core/PhaseManager', 'core/EventBus', 'scenes/'],
  },
  {
    layer: 'core/**',
    dir: join(SRC, 'core'),
    banned: [
      'ui/theme',
      'objects/battleVisualTheme',
      'objects/worldMapVisualTheme',
      'objects/itemVisualTheme',
      'objects/prepVisualTheme',
    ],
  },
];

// Matches both `import ... from 'x'` and `export ... from 'x'`
const FROM_RE = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g;

// ─── Visual theme isolation ────────────────────────────────────────────────
// Domain visual theme files must not import from ui/theme.
// Importing UI_THEME would create a layering violation and risk circular deps.
for (const [file, content] of walkFiles(join(SRC, 'objects'))) {
  if (!file.endsWith('VisualTheme.ts')) continue;
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    let m;
    FROM_RE.lastIndex = 0;
    while ((m = FROM_RE.exec(line)) !== null) {
      if (m[1].includes('ui/theme')) {
        const rel = relative(SRC, file);
        errors.push(`  ${rel}:${i + 1}  [*VisualTheme.ts] must not import ui/theme  →  "${m[1]}"`);
      }
    }
  });
}

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

// ─── No ambient Math.random() in gameplay/domain code ─────────────────────
// Only src/core/random.ts may call Math.random(). All other battle and core
// code must use the Rng interface injected from PhaseManager.
const MATH_RANDOM_RE = /Math\.random\s*\(/g;
const AMBIENT_RANDOM_DIRS = [join(SRC, 'battle'), join(SRC, 'core')];
const AMBIENT_RANDOM_ALLOWLIST = [join(SRC, 'core', 'random.ts')];

for (const dir of AMBIENT_RANDOM_DIRS) {
  for (const [file, content] of walkFiles(dir)) {
    if (AMBIENT_RANDOM_ALLOWLIST.includes(file)) continue;
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      MATH_RANDOM_RE.lastIndex = 0;
      if (MATH_RANDOM_RE.test(line)) {
        const rel = relative(SRC, file);
        errors.push(`  ${rel}:${i + 1}  [no-ambient-random] Math.random() forbidden in gameplay code — use injected Rng`);
      }
    });
  }
}

if (errors.length > 0) {
  console.error('Boundary violations found:\n');
  errors.forEach(e => console.error(e));
  process.exit(1);
} else {
  console.log('✓ All boundaries clean');
}

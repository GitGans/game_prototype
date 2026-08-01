#!/usr/bin/env node
// Boundary checker.
// Run: node scripts/check-boundaries.mjs
//
// Every module dependency form is detected (see scripts/import-scanner.mjs):
//   import ... from 'x'
//   export ... from 'x'
//   import 'x'          — side-effect import; runs the module body, binds nothing
//   import('x')
// Files are scanned whole, so multiline import lists are matched too.
//
// Import specifiers are normalized relative to the importing file before rules
// are applied, so a rule can be written once ("core/GameState") and still catch
// both `../core/GameState` from another layer and `./GameState` from inside
// core/ itself.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve, sep } from 'path';
import { findImports } from './import-scanner.mjs';

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
    banned: ['battle', 'core', 'data', 'objects', 'scenes', 'ui', 'world'],
  },
  {
    layer: 'data/**',
    dir: join(SRC, 'data'),
    // data/ → shared/ is explicitly allowed
    banned: ['battle', 'core', 'objects', 'scenes', 'ui', 'world'],
  },
  {
    layer: 'battle/**',
    dir: join(SRC, 'battle'),
    banned: ['core', 'campaign', 'phaser'],
  },
  {
    layer: 'ui/**',
    dir: join(SRC, 'ui'),
    // core/Constants (LAYOUT_SCALE) is explicitly allowed
    banned: ['core/GameState', 'core/PhaseManager', 'core/EventBus', 'objects', 'scenes', 'battle', 'world'],
  },
  {
    layer: 'objects/**',
    dir: join(SRC, 'objects'),
    // core/Constants, core/phases, core/unitSpriteKey, battle/types allowed; battle runtime modules banned
    banned: [
      'core/GameState', 'core/PhaseManager', 'core/EventBus', 'scenes',
      'battle/combat',
      'battle/skillRuntime',
      'battle/skillPatterns',
      'battle/skillDefinitionRuntime',
      'battle/skillPreview',
      'battle/turnResolver',
    ],
  },
  {
    layer: 'scenes/**',
    dir: join(SRC, 'scenes'),
    // Only skill preview is banned; broader scenes -> battle dependencies remain allowed in this stage
    banned: ['battle/skillPreview'],
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
  {
    layer: 'progression/**',
    dir: join(SRC, 'progression'),
    banned: ['core', 'battle', 'objects', 'scenes', 'ui', 'world'],
  },
  {
    layer: 'inventory/**',
    dir: join(SRC, 'inventory'),
    // inventory is a pure domain: only shared/ and data/ allowed (and local inventory/ imports)
    banned: ['battle', 'core', 'progression', 'objects', 'scenes', 'ui', 'world'],
  },
  {
    layer: 'campaign/**',
    dir: join(SRC, 'campaign'),
    // campaign is a persistent-state contract: shared/, progression/, inventory/, world/ (type
    // contracts) allowed; no battle/core/scenes/objects/ui
    banned: ['battle', 'core', 'objects', 'scenes', 'ui'],
  },
];

// ─── Pure core modules ──────────────────────────────────────────────────────
// These compose domains but must not reach runtime storage or rendering.
// The single battle-start pipeline is the main architectural result of the
// persistent-dead stage; without these rules it could silently regrow a
// GameState dependency.
const PURE_CORE_FILES = [
  {
    file: join(SRC, 'core', 'battleSetupProjection.ts'),
    banned: [
      'core/GameState', 'core/DebugBattleState', 'core/phases', 'core/PhaseManager',
      'campaign', 'scenes', 'objects', 'ui', 'phaser',
    ],
  },
  {
    file: join(SRC, 'core', 'battleParticipants.ts'),
    banned: [
      'progression', 'inventory', 'campaign',
      'core/GameState', 'core/DebugBattleState', 'core/playerSessionStore',
      'core/phases', 'core/PhaseManager',
      'scenes', 'objects', 'ui', 'phaser',
    ],
  },
  {
    file: join(SRC, 'core', 'battleStart.ts'),
    // May import the core session CONTRACT (playerSessionState) — it is the
    // composition boundary — but never the runtime store or a rendering layer.
    banned: [
      'core/GameState', 'core/DebugBattleState', 'core/playerSessionStore',
      'core/phases', 'core/PhaseManager',
      'campaign', 'scenes', 'objects', 'ui', 'phaser',
    ],
  },
];

// Relative specifiers are resolved against the importing file and expressed
// src-relative with posix separators, so rules use one vocabulary:
//   './GameState'        from src/core/x.ts    → core/GameState
//   '../campaign'        from src/core/x.ts    → campaign
//   '../../battle/types' from src/core/a/b.ts  → battle/types
// Bare package specifiers ('phaser', 'vitest') pass through unchanged.
function normalizeSpecifier(importerFile, spec) {
  if (!spec.startsWith('.')) return spec;
  return relative(SRC, resolve(dirname(importerFile), spec)).split(sep).join('/');
}

// A banned entry matches the whole normalized path or a path prefix at a
// segment boundary. 'battle' matches 'battle/types' but not 'battleFoo';
// 'battle/combat' matches itself but not 'battle/combatStart'.
function isBanned(normalized, bannedEntry) {
  const b = bannedEntry.replace(/\/+$/, '');
  return normalized === b || normalized.startsWith(`${b}/`);
}

// ─── Visual theme isolation ────────────────────────────────────────────────
// Domain visual theme files must not import from ui/theme.
// Importing UI_THEME would create a layering violation and risk circular deps.
for (const [file, content] of walkFiles(join(SRC, 'objects'))) {
  if (!file.endsWith('VisualTheme.ts')) continue;
  for (const { spec, line } of findImports(content)) {
    if (isBanned(normalizeSpecifier(file, spec), 'ui/theme')) {
      errors.push(`  ${relative(SRC, file)}:${line}  [*VisualTheme.ts] must not import ui/theme  →  "${spec}"`);
    }
  }
}

for (const { layer, dir, banned } of RULES) {
  for (const [file, content] of walkFiles(dir)) {
    for (const { spec, line } of findImports(content)) {
      const normalized = normalizeSpecifier(file, spec);
      for (const b of banned) {
        if (isBanned(normalized, b)) {
          errors.push(`  ${relative(SRC, file)}:${line}  [${layer}] imports from ${b}  →  "${spec}"`);
        }
      }
    }
  }
}

for (const { file, banned } of PURE_CORE_FILES) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(SRC, file);
  for (const { spec, line } of findImports(content)) {
    const normalized = normalizeSpecifier(file, spec);
    for (const b of banned) {
      if (isBanned(normalized, b)) {
        errors.push(`  ${rel}:${line}  [pure-core] must not import ${b}  →  "${spec}"`);
      }
    }
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

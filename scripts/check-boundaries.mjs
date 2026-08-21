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
import {
  evaluateDirectoryPolicy,
  matchesPathPrefix,
} from './boundary-policy.mjs';
import { findUncoveredLayers } from './layer-coverage.mjs';

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
    root: 'shared',
    policy: {
      kind: 'blocklist',
      banned: ['battle', 'core', 'data', 'objects', 'scenes', 'ui', 'world', 'save'],
    },
  },
  {
    layer: 'data/**',
    root: 'data',
    policy: {
      kind: 'blocklist',
      // data/ → shared/ is explicitly allowed
      banned: ['battle', 'core', 'objects', 'scenes', 'ui', 'world', 'save'],
    },
  },
  {
    layer: 'world/**',
    root: 'world',
    // world is a pure domain layer restricted by an allowlist, not a blocklist:
    // it may reach only its own modules and shared/ contracts. Because this is
    // closed rather than open, a future domain (save/, dialogue/, ...) is
    // rejected automatically without ever editing this rule.
    policy: {
      kind: 'src-allowlist',
      allowedSrcRoots: ['world', 'shared'],
      bannedPackages: ['phaser'],
    },
  },
  {
    layer: 'battle/**',
    root: 'battle',
    policy: {
      kind: 'blocklist',
      banned: ['core', 'campaign', 'phaser', 'save'],
    },
  },
  {
    layer: 'ui/**',
    root: 'ui',
    policy: {
      kind: 'blocklist',
      // core/Constants (LAYOUT_SCALE) is explicitly allowed
      banned: ['core/GameState', 'core/PhaseManager', 'core/EventBus', 'objects', 'scenes', 'battle', 'world', 'save'],
    },
  },
  {
    layer: 'objects/**',
    root: 'objects',
    policy: {
      kind: 'blocklist',
      // core/Constants, core/phases, core/unitSpriteKey, battle/types allowed; battle runtime modules banned
      banned: [
        'core/GameState', 'core/PhaseManager', 'core/EventBus', 'scenes',
        'battle/combat',
        'battle/skillRuntime',
        'battle/skillPatterns',
        'battle/skillDefinitionRuntime',
        'battle/skillPreview',
        'battle/turnResolver',
        'save',
      ],
    },
  },
  {
    layer: 'scenes/**',
    root: 'scenes',
    policy: {
      kind: 'blocklist',
      // Only skill preview is banned; broader scenes -> battle dependencies remain allowed in this stage
      banned: ['battle/skillPreview', 'save'],
    },
  },
  {
    layer: 'core/**',
    root: 'core',
    policy: {
      kind: 'blocklist',
      // core is the future orchestration layer for save/load — it is the only layer
      // allowed to import save/ (not yet exercised: no save action exists in this stage)
      banned: [
        'phaser',
        'ui/theme',
        'objects/battleVisualTheme',
        'objects/worldMapVisualTheme',
        'objects/itemVisualTheme',
        'objects/prepVisualTheme',
      ],
    },
  },
  {
    layer: 'progression/**',
    root: 'progression',
    policy: {
      kind: 'blocklist',
      banned: ['core', 'battle', 'objects', 'scenes', 'ui', 'world', 'save'],
    },
  },
  {
    layer: 'inventory/**',
    root: 'inventory',
    policy: {
      kind: 'blocklist',
      // inventory is a pure domain: only shared/ and data/ allowed (and local inventory/ imports)
      banned: ['battle', 'core', 'progression', 'objects', 'scenes', 'ui', 'world', 'save'],
    },
  },
  {
    layer: 'campaign/**',
    root: 'campaign',
    policy: {
      kind: 'blocklist',
      // campaign is a persistent-state contract: shared/, progression/, inventory/, world/ (type
      // contracts) allowed; no battle/core/scenes/objects/ui. save/ is also banned here even
      // though SaveRepository references CampaignState — the dependency is one-way (save → campaign).
      banned: ['battle', 'core', 'objects', 'scenes', 'ui', 'save'],
    },
  },
  {
    layer: 'save/**',
    root: 'save',
    // Closed allowlist, same shape as world/**: save/ may reach only itself, campaign/
    // (for the CampaignState contract) and shared/. No core/battle/rendering/Phaser.
    policy: {
      kind: 'src-allowlist',
      allowedSrcRoots: ['save', 'campaign', 'shared'],
      bannedPackages: ['phaser'],
    },
  },
];

// Every current top-level directory under src/ is a real architectural
// layer and is covered by a RULES entry — this registry stays empty for
// now. Add an entry only when a top-level directory genuinely isn't a
// dependency layer (generated output, fixtures, etc.), e.g.:
//   { root: 'generated', reason: 'Build output, not a source dependency layer' }
const LAYER_COVERAGE_EXCLUSIONS = [];

function listTopLevelSourceDirectories() {
  return readdirSync(SRC, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

const uncoveredLayers = findUncoveredLayers({
  discoveredRoots: listTopLevelSourceDirectories(),
  ruleRoots: RULES.map(rule => rule.root),
  exclusions: LAYER_COVERAGE_EXCLUSIONS,
});

for (const root of uncoveredLayers) {
  errors.push(
    `  ${root}/**  [layer-coverage] has no directory boundary rule ` +
    'and no explicit exclusion with an architectural reason',
  );
}

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
  {
    file: join(SRC, 'core', 'battleExit.ts'),
    // The source-neutral battle-result rule. May compose battle runtime contracts,
    // progression, the session CONTRACT and static definitions — never storage, never a
    // source key, never phase contracts.
    banned: [
      'core/GameState', 'core/DebugBattleState', 'core/playerSessionStore',
      'core/phases', 'core/PhaseManager',
      'campaign', 'scenes', 'objects', 'ui', 'phaser',
    ],
  },
  {
    file: join(SRC, 'core', 'playerBattleExitProjection.ts'),
    banned: [
      'core/GameState', 'core/DebugBattleState',
      'core/playerSessionState', 'core/playerSessionStore',
      'core/phases', 'core/PhaseManager',
      'campaign', 'scenes', 'objects', 'ui', 'phaser',
    ],
  },
  {
    file: join(SRC, 'core', 'battleResultsSnapshot.ts'),
    // A phase snapshot builder: it may import the phase snapshot CONTRACT
    // (BattleResultParticipantSeed / BattleResultUnit) type-only, exactly like
    // rosterCampSnapshot.ts and upgradeTreeSnapshot.ts. It receives a roster explicitly
    // and never resolves storage itself.
    banned: [
      'core/GameState', 'core/DebugBattleState',
      'core/playerSessionState', 'core/playerSessionStore',
      'core/PhaseManager',
      'campaign', 'scenes', 'objects', 'ui', 'phaser',
    ],
  },
  {
    file: join(SRC, 'core', 'playerUnitPersistence.ts'),
    // The pure owner of persistent player-unit transformations. It may see battle
    // runtime contracts and progression roster contracts — never storage or a source key.
    banned: [
      'core/GameState', 'core/DebugBattleState',
      'core/playerSessionState', 'core/playerSessionStore',
      'core/phases', 'core/PhaseManager',
      'campaign', 'inventory', 'scenes', 'objects', 'ui', 'phaser',
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

// ─── Visual theme isolation ────────────────────────────────────────────────
// Domain visual theme files must not import from ui/theme.
// Importing UI_THEME would create a layering violation and risk circular deps.
for (const [file, content] of walkFiles(join(SRC, 'objects'))) {
  if (!file.endsWith('VisualTheme.ts')) continue;
  for (const { spec, line } of findImports(content)) {
    if (matchesPathPrefix(normalizeSpecifier(file, spec), 'ui/theme')) {
      errors.push(`  ${relative(SRC, file)}:${line}  [*VisualTheme.ts] must not import ui/theme  →  "${spec}"`);
    }
  }
}

for (const { layer, root, policy } of RULES) {
  for (const [file, content] of walkFiles(join(SRC, root))) {
    for (const { spec, line } of findImports(content)) {
      const normalizedSpecifier = normalizeSpecifier(file, spec);
      const violation = evaluateDirectoryPolicy({
        policy,
        normalizedSpecifier,
        isRelativeSpecifier: spec.startsWith('.'),
      });

      if (violation === null) continue;

      if (violation.kind === 'banned-path') {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] imports from ` +
          `${violation.entry}  →  "${spec}"`,
        );
      } else if (violation.kind === 'outside-allowed-src-roots') {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] may import only ` +
          `${violation.allowedSrcRoots.join(', ')} within src  →  "${spec}"`,
        );
      } else {
        errors.push(
          `  ${relative(SRC, file)}:${line}  [${layer}] must not import package ` +
          `${violation.entry}  →  "${spec}"`,
        );
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
      if (matchesPathPrefix(normalized, b)) {
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

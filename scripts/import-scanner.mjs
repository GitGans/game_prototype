// Single source of truth for "what counts as a module dependency".
// Every boundary rule scans through findImports(), so no rule can accidentally
// enforce a narrower set of import forms than the others.

// import ... from 'x'  and  export ... from 'x'
const FROM_RE = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g;

// import 'x' — side-effect import: runs the module body, binds nothing.
// Without this, a pure module could take on a forbidden dependency while the
// boundary checker still reported success.
const SIDE_EFFECT_IMPORT_RE = /\bimport\s+['"]([^'"]+)['"]/g;

// import('x')
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Yields every import specifier in a file with its 1-based line number, in
 * source order. Callers pass whole file contents, not single lines, so
 * multiline import lists are matched.
 */
export function* findImports(content) {
  const matches = [];

  for (const re of [FROM_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;

    let match;
    while ((match = re.exec(content)) !== null) {
      matches.push({
        spec: match[1],
        line: content.slice(0, match.index).split('\n').length,
        index: match.index,
      });
    }
  }

  // Diagnostics must follow source order regardless of which expression matched.
  matches.sort((a, b) => a.index - b.index);

  for (const { spec, line } of matches) {
    yield { spec, line };
  }
}

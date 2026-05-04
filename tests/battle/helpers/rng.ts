import type { Rng } from '../../../src/shared/random';

/** Always returns the same value. */
export function fixedRng(value: number): Rng {
  return { next: () => value };
}

/** Returns values in sequence, cycling when exhausted. */
export function sequenceRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

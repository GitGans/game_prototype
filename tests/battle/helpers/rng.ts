/** Always returns the same value. */
export function fixedRng(value: number): () => number {
  return () => value;
}

/** Returns values in sequence, cycling when exhausted. */
export function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

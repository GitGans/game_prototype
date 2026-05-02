export interface Rng {
  next(): number; // must return >= 0 and < 1
}

/** Validates a value from rng.next(). Throws if out of range. */
export function assertRngValue(value: number): number {
  if (value < 0 || value >= 1) {
    throw new Error(`Invalid RNG value: ${value}. Must be >= 0 and < 1.`);
  }
  return value;
}

/** Returns a random integer in [0, maxExclusive). Throws if maxExclusive <= 0. */
export function randomInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error(`randomInt: maxExclusive must be > 0, got ${maxExclusive}`);
  }
  return Math.floor(assertRngValue(rng.next()) * maxExclusive);
}

/**
 * Returns a random element from values.
 * Throws if values is empty — use when an empty array is a logic error.
 */
export function pickOne<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error('pickOne: values array must not be empty');
  }
  return values[randomInt(rng, values.length)];
}

/**
 * Returns a random element from values, or null if values is empty.
 * Use when an empty array is valid gameplay state.
 */
export function pickOneOrNull<T>(rng: Rng, values: readonly T[]): T | null {
  if (values.length === 0) return null;
  return values[randomInt(rng, values.length)];
}

/**
 * Returns true with probability chancePercent/100.
 * chancePercent must be in [0, 100]. Throws otherwise.
 * Example: rollPercent(rng, 30) is true ~30% of the time.
 */
export function rollPercent(rng: Rng, chancePercent: number): boolean {
  if (chancePercent < 0 || chancePercent > 100) {
    throw new Error(`rollPercent: chancePercent must be in [0, 100], got ${chancePercent}`);
  }
  return assertRngValue(rng.next()) * 100 < chancePercent;
}

/**
 * Returns true with probability `probability`.
 * probability must be in [0, 1]. Throws otherwise.
 * Example: rollProbability(rng, 0.6) is true ~60% of the time.
 */
export function rollProbability(rng: Rng, probability: number): boolean {
  if (probability < 0 || probability > 1) {
    throw new Error(`rollProbability: probability must be in [0, 1], got ${probability}`);
  }
  return assertRngValue(rng.next()) < probability;
}

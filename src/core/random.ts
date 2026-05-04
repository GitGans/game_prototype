import type { Rng } from '../shared/random';
import { assertRngValue } from '../shared/random';

export class MathRng implements Rng {
  next(): number {
    return Math.random();
  }
}

export class ScriptedRng implements Rng {
  private readonly values: readonly number[];
  private index = 0;

  constructor(values: readonly number[]) {
    this.values = values;
  }

  next(): number {
    if (this.index >= this.values.length) {
      throw new Error(
        `ScriptedRng exhausted after ${this.values.length} value(s). ` +
        `Call index: ${this.index}`,
      );
    }
    const value = this.values[this.index++];
    return assertRngValue(value);
  }
}

export interface GameplayRngStreams {
  battleSetup: Rng;
  battleResolution: Rng;
}

export function createDefaultGameplayRngStreams(): GameplayRngStreams {
  return {
    battleSetup: new MathRng(),
    battleResolution: new MathRng(),
  };
}

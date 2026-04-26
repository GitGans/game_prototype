import type { UnitShape } from '../shared/gridTypes';

export const SHAPES: Record<string, UnitShape> = {
  '1x1': { offsets: [{ dr: 0, dc: 0 }] },
  '1x2': { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] },
  '2x1': { offsets: [{ dr: 0, dc: 0 }, { dr: 1, dc: 0 }] },
  '2x2': { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }] },
};

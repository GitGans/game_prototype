export type Side = 'player' | 'enemy';
export type Row = 0 | 1; // 0 = front, 1 = back
export type Col = 0 | 1 | 2;

export interface CellCoord {
  readonly side: Side;
  readonly row: Row;
  readonly col: Col;
}

export interface ShapeOffset {
  readonly dr: number;
  readonly dc: number;
}

// `unit.shape` aliases an entry in the shared SHAPES registry (data/shapeDefinitions.ts) —
// every unit of the same shape holds the SAME object. Readonly makes a process-wide
// corruption through one holder a compile error rather than a convention.
export interface UnitShape {
  readonly offsets: readonly ShapeOffset[];
}

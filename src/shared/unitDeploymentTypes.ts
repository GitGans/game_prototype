import type { CellCoord } from './gridTypes';

export type UnitDeployment =
  | { kind: 'field'; anchor: CellCoord }
  | { kind: 'bench'; slot: number };

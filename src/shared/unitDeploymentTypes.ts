import type { CellCoord } from './gridTypes';

export type UnitDeployment =
  | { readonly kind: 'field'; readonly anchor: CellCoord }
  | { readonly kind: 'bench'; readonly slot: number };

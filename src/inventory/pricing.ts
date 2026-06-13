import type { ItemDefinition } from '../shared/itemTypes';

export function getSellPrice(def: ItemDefinition): number {
  return Math.floor(def.buyPrice / 4);
}

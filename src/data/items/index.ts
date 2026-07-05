import { buildItemCatalog } from './buildItemCatalog';
import { EQUIPMENT_GROUPS } from './equipment';
import { USABLE_GROUPS } from './usable';
import { CONSUMABLE_GROUPS } from './consumables';

export const ITEM_CATALOG = buildItemCatalog([
  ...EQUIPMENT_GROUPS,
  ...USABLE_GROUPS,
  ...CONSUMABLE_GROUPS,
]);
export const ITEM_DEFINITIONS = ITEM_CATALOG.definitions;

export type { ItemGroup, AuthoredItem } from './authoredItemTypes';
export { buildItemCatalog } from './buildItemCatalog';

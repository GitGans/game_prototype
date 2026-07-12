// Compatibility shim. Item content now lives in src/data/items/ (grouped authoring) and is
// generated into ITEM_CATALOG. This file only re-exports so existing import sites keep working.
export { ITEM_CATALOG, ITEM_DEFINITIONS } from './items';

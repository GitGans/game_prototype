import { UNIT_CLASS_DEFINITIONS } from '../data/unitClassDefinitions';
import type { UnitClassDefinition, UnitClassId } from '../shared/unitTypes';

export function resolveUnitClassDefinition(id: UnitClassId): UnitClassDefinition {
  const def = UNIT_CLASS_DEFINITIONS[id as string as keyof typeof UNIT_CLASS_DEFINITIONS];
  if (!def) throw new Error(`Unknown UnitClassId: "${String(id)}"`);
  return def;
}

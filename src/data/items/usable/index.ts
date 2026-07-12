import type { ItemGroup } from '../authoredItemTypes';
import { HP_RECOVERY_GROUP } from './healing';
import { RESURRECTION_GROUP } from './resurrection';

export const USABLE_GROUPS: readonly ItemGroup[] = [HP_RECOVERY_GROUP, RESURRECTION_GROUP];

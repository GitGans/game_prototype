import type { LayoutCell } from '../shared/worldTypes';
import { UI_THEME } from '../ui/theme';

export function resolveWorldMapCellColor(
  cell: LayoutCell | null | undefined,
  entityAlive: boolean | undefined,
): number {
  const wmc = UI_THEME.component.worldMapCell;

  if (cell === 'wall' || cell === 'tree') return wmc.empty;
  if (cell === null || cell === undefined) return wmc.forest;

  if (entityAlive === false) return wmc.fog;

  switch (cell.type) {
    case 'mob':    return wmc.enemy;
    case 'camp':   return wmc.camp;
    case 'portal': return wmc.town;
    case 'shop':   return wmc.dungeon;
    default:       return wmc.start;
  }
}

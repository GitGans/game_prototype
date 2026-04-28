import { LAYOUT_SCALE } from "../core/Constants";

/** Scales a raw pixel value to the current viewport scale. */
export function scaled(px: number): number {
  return Math.round(px * LAYOUT_SCALE);
}

/**
 * Returns the left-edge X of an item centered inside a container.
 * Add itemWidth/2 to get the center point of the centered item.
 */
export function centerX(containerWidth: number, itemWidth: number): number {
  return Math.round((containerWidth - itemWidth) / 2);
}

/**
 * Returns the top-edge Y of an item centered inside a container.
 * Add itemHeight/2 to get the center point of the centered item.
 */
export function centerY(containerHeight: number, itemHeight: number): number {
  return Math.round((containerHeight - itemHeight) / 2);
}

/**
 * Returns the center Y of the i-th item in a vertical stack.
 * startY is the center Y of the first item (index 0).
 */
export function stackY(startY: number, itemHeight: number, index: number, gap: number = 0): number {
  return Math.round(startY + index * (itemHeight + gap));
}

/**
 * Returns the center X of the i-th item in a horizontal row centered at rowCenterX.
 * Items have equal width with a uniform gap between them.
 *
 * Example — two buttons (count=2, itemWidth=180, gap=20, rowCenterX=w/2):
 *   index 0 → w/2 - 100   (left button)
 *   index 1 → w/2 + 100   (right button)
 *
 * Example — one button (count=1):
 *   index 0 → rowCenterX  (perfectly centered)
 */
export function rowItemCenterX(
  rowCenterX: number,
  itemWidth:  number,
  gap:        number,
  count:      number,
  index:      number,
): number {
  const totalWidth = count * itemWidth + (count - 1) * gap;
  return Math.round(rowCenterX - totalWidth / 2 + index * (itemWidth + gap) + itemWidth / 2);
}

/**
 * Returns the center {x, y} of a cell in a uniform grid.
 * startX/startY is the center of the cell at (col=0, row=0).
 */
export function gridPosition(
  startX: number,
  startY: number,
  cellW:  number,
  cellH:  number,
  col:    number,
  row:    number,
  gapX:   number = 0,
  gapY:   number = 0,
): { x: number; y: number } {
  return {
    x: Math.round(startX + col * (cellW + gapX)),
    y: Math.round(startY + row * (cellH + gapY)),
  };
}

import Phaser from "phaser";
import { ItemSlotSnapshot } from "../shared/snapshotTypes";
import { IconSquareView } from "../ui/IconSquareView";
import { OBJECT_ICON_LAYOUT } from "./iconLayout";

/**
 * Item icon at a fixed square size. Adapts an ItemSlotSnapshot to the generic
 * IconSquareView. Pure visual — no tooltip, no input, no slot logic.
 * Top-left at (x, y). Parent must add this to its container.
 */
export class ItemIconView extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number,
    item: ItemSlotSnapshot,
    alpha = 1,
  ) {
    super(scene, x, y);
    this.add(
      new IconSquareView({
        scene,
        x: 0,
        y: 0,
        size,
        textureKey: `sprite-item-${item.definition.id}`,
        fallbackText: item.definition.name,
        alpha,
        inset: OBJECT_ICON_LAYOUT.iconInset,
      }),
    );
  }
}

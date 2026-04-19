import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { TOOLTIP, fontSize, VALUE_COLOR } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";

const TW      = Math.round(250 * LAYOUT_SCALE);
const VAL_COL = Math.round(90  * LAYOUT_SCALE);

export interface ItemTooltipData {
  name:  string;
  stats: Array<{ label: string; value: number }>;
  /** null = no class restriction */
  classRestriction: string | null;
  /** null = no restriction; true = allowed; false = not allowed */
  classAllowed: boolean | null;
}

export class ItemTooltip extends BaseTooltip<ItemTooltipData> {
  constructor(scene: Phaser.Scene) {
    super(scene, TW);
  }

  // Prep.ts calls: itemTooltip.show(data, anchorX, anchorY, "right")

  protected buildContent(data: ItemTooltipData): number {
    const pad   = TOOLTIP.pad;
    const lineH = TOOLTIP.lineH;
    let y       = pad;

    // Item name
    this.addText(pad, y, data.name, {
      fontSize: fontSize("sm"), color: VALUE_COLOR.highlight, fontStyle: "bold",
    });
    y += lineH;

    // Stat lines
    for (const { label, value } of data.stats) {
      const color = value > 0 ? VALUE_COLOR.positive : VALUE_COLOR.negative;
      const sign  = value > 0 ? "+" : "";
      this.addText(pad, y, `${label}:`, {
        fontSize: fontSize("xs"), color: VALUE_COLOR.neutral,
      });
      this.addText(pad + VAL_COL, y, `${sign}${value}`, {
        fontSize: fontSize("xs"), color,
      });
      y += lineH;
    }

    // Class restriction line
    if (data.classRestriction !== null) {
      const color =
        data.classAllowed === null ? VALUE_COLOR.neutral :
        data.classAllowed          ? VALUE_COLOR.positive :
                                     VALUE_COLOR.negative;
      this.addText(pad, y, `Classes: ${data.classRestriction}`, {
        fontSize: fontSize("xs"), color,
        wordWrap: { width: TW - pad * 2 },
      });
      y += lineH;
    }

    return y + pad;
  }
}

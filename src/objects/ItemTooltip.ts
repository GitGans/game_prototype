import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { UI_THEME, fontSize } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";

const TW      = Math.round(250 * LAYOUT_SCALE);
const VAL_COL = Math.round(90  * LAYOUT_SCALE);

export interface ItemTooltipData {
  name:  string;
  /** `display` is the unsigned formatted magnitude (e.g. "5" or "5%"); this component owns the sign. */
  stats: Array<{ label: string; value: number; display: string }>;
  /** null = no class restriction */
  classRestriction: string | null;
  /** null = no restriction; true = allowed; false = not allowed */
  classAllowed: boolean | null;
  /**
   * Extra wrapped lines rendered after the class line, already composed by the caller.
   * This component renders supplied text and composes nothing itself.
   */
  notes: Array<{ text: string; tone: 'neutral' | 'positive' | 'negative' }>;
}

export class ItemTooltip extends BaseTooltip<ItemTooltipData> {
  constructor(scene: Phaser.Scene) {
    super(scene, TW, UI_THEME.component.tooltip.bg, UI_THEME.component.tooltip.bgAlpha);
  }

  // Prep.ts calls: itemTooltip.show(data, anchorX, anchorY, "right")

  protected buildContent(data: ItemTooltipData): number {
    const pad   = UI_THEME.component.tooltip.pad;
    const lineH = UI_THEME.component.tooltip.lineH;
    let y       = pad;

    // Item name
    this.addText(pad, y, data.name, {
      fontSize: fontSize("sm"), color: UI_THEME.color.value.highlight, fontStyle: "bold",
    });
    y += lineH;

    // Stat lines
    for (const { label, value, display } of data.stats) {
      const color = value > 0 ? UI_THEME.color.value.positive : UI_THEME.color.value.negative;
      const sign  = value > 0 ? "+" : value < 0 ? "-" : "";
      this.addText(pad, y, `${label}:`, {
        fontSize: fontSize("xs"), color: UI_THEME.color.value.neutral,
      });
      this.addText(pad + VAL_COL, y, `${sign}${display}`, {
        fontSize: fontSize("xs"), color,
      });
      y += lineH;
    }

    // Class restriction line
    if (data.classRestriction !== null) {
      const color =
        data.classAllowed === null ? UI_THEME.color.value.neutral :
        data.classAllowed          ? UI_THEME.color.value.positive :
                                     UI_THEME.color.value.negative;
      this.addText(pad, y, `Classes: ${data.classRestriction}`, {
        fontSize: fontSize("xs"), color,
        wordWrap: { width: TW - pad * 2 },
      });
      y += lineH;
    }

    // Note lines (use effect, blocked reason). Wrapped, so height is measured, not assumed.
    for (const note of data.notes) {
      const color =
        note.tone === 'positive' ? UI_THEME.color.value.positive :
        note.tone === 'negative' ? UI_THEME.color.value.negative :
                                   UI_THEME.color.value.neutral;
      const text = this.addText(pad, y, note.text, {
        fontSize: fontSize("xs"), color,
        wordWrap: { width: TW - pad * 2 },
      });
      y += Math.max(lineH, text.height);
    }

    return y + pad;
  }
}

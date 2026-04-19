import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { TOOLTIP, fontSize, VALUE_COLOR } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import { ActiveEffect } from "../battle/types";

const TW = Math.round(160 * LAYOUT_SCALE);

export class EffectTooltip extends BaseTooltip<ActiveEffect> {
  constructor(scene: Phaser.Scene) {
    super(scene, TW);
  }

  // UnitView calls: effectTooltip.show(ae, worldX, worldY, side)
  // BaseTooltip.show() calls buildContent() then placeNear() automatically.

  protected buildContent(ae: ActiveEffect): number {
    const pad = TOOLTIP.pad;

    let desc = ae.effect.description ?? "";
    if (ae.computedPerTurn !== undefined) {
      const sign = ae.effect.isBuff ? "+" : "-";
      desc += ` (${sign}${Math.abs(ae.computedPerTurn)} HP/round)`;
    }

    this.addText(pad, pad, ae.effectDisplayName, {
      fontSize:  fontSize("sm"),
      color:     VALUE_COLOR.white,
      fontStyle: "bold",
      wordWrap:  { width: TW - pad * 2 },
    });

    const descTxt = this.addText(pad, pad + TOOLTIP.lineH, desc, {
      fontSize: fontSize("xs"),
      color:    VALUE_COLOR.muted,
      wordWrap: { width: TW - pad * 2 },
    });

    return pad + TOOLTIP.lineH + descTxt.height + pad;
  }
}

import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { UI_THEME, fontSize } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import type { ActiveEffect } from "../shared/activeEffect";
import { resolveActiveEffectPeriodicHp } from "../shared/activeEffect";

const TW = Math.round(160 * LAYOUT_SCALE);

export class EffectTooltip extends BaseTooltip<ActiveEffect> {
  constructor(scene: Phaser.Scene) {
    super(scene, TW);
  }

  // UnitView calls: effectTooltip.show(ae, worldX, worldY, side)
  // BaseTooltip.show() calls buildContent() then placeNear() automatically.

  protected buildContent(ae: ActiveEffect): number {
    const pad = UI_THEME.component.tooltip.pad;

    let desc = ae.effect.description ?? "";
    const periodicHp = resolveActiveEffectPeriodicHp(ae);
    if (periodicHp) {
      const sign = periodicHp.direction === 'heal' ? '+' : '-';
      desc += ` (${sign}${Math.abs(periodicHp.amountPerTurn)} HP/round)`;
    }

    this.addText(pad, pad, ae.effectDisplayName, {
      fontSize:  fontSize("sm"),
      color:     UI_THEME.color.value.white,
      fontStyle: "bold",
      wordWrap:  { width: TW - pad * 2 },
    });

    const descTxt = this.addText(pad, pad + UI_THEME.component.tooltip.lineH, desc, {
      fontSize: fontSize("xs"),
      color:    UI_THEME.color.value.muted,
      wordWrap: { width: TW - pad * 2 },
    });

    return pad + UI_THEME.component.tooltip.lineH + descTxt.height + pad;
  }
}

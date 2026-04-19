import Phaser from "phaser";
import { LAYOUT_SCALE, COLORS } from "../core/Constants";
import { TOOLTIP, fontSize } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";

const TW = Math.round(140 * LAYOUT_SCALE);

export interface SkillTooltipData {
  name:       string;
  damageType: string | undefined;
}

export class SkillTooltip extends BaseTooltip<SkillTooltipData> {
  constructor(scene: Phaser.Scene) {
    super(scene, TW);
    this.setDepth(200);
  }

  // Game.ts calls: skillTooltip.show(data, iconRightX, iconCenterY, "right")

  protected buildContent(data: SkillTooltipData): number {
    const pad = TOOLTIP.pad;
    const color =
      data.damageType === "magical"  ? COLORS.skillMagical  :
      data.damageType === "physical" ? COLORS.skillPhysical :
      "#ffffff";

    const t = this.addText(pad, pad, data.name, {
      fontSize:  fontSize("sm"),
      color,
      fontStyle: "bold",
      wordWrap:  { width: TW - pad * 2 },
    });

    return pad + t.height + pad;
  }
}

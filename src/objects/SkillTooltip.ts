import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";
import { UI_THEME, fontSize } from "../ui/theme";
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
    const pad = UI_THEME.component.tooltip.pad;
    const color =
      data.damageType === "magical"  ? BATTLE_VISUAL_THEME.skill.magical  :
      data.damageType === "physical" ? BATTLE_VISUAL_THEME.skill.physical :
      UI_THEME.color.value.white;

    const t = this.addText(pad, pad, data.name, {
      fontSize:  fontSize("sm"),
      color,
      fontStyle: "bold",
      wordWrap:  { width: TW - pad * 2 },
    });

    return pad + t.height + pad;
  }
}

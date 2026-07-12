import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";
import { UI_THEME, fontSize } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import type { BattleUnitSnapshot } from "../shared/battleSnapshots";
import type { SkillIconColorKind } from "../shared/snapshotTypes";
import { buildSkillIconSnapshot } from "../core/unitUpgradePresentation";
import type { UnitStatsSnapshot } from '../core/phases';
import { resolveStatTone } from "../shared/statHighlight";
import type { UnitBattleStatKey } from "../shared/unitTypes";
import { UNIT_BATTLE_STAT_KEYS, STAT_PRESENTATION, formatStatValue } from './statPresentation';

const W           = Math.round(200 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64  * LAYOUT_SCALE);

interface UnitIdentitySnapshot {
  templateId: string;
  name: string;
  // Mirrors UnitTabSnapshot.className — the equip screen's stats body source.
  className?: string;
}

interface StatValue { value: number; highlightBase: number }
function statColor(sv: StatValue): string {
  switch (resolveStatTone(sv.value, sv.highlightBase)) {
    case 'positive': return UI_THEME.color.value.positive;
    case 'negative': return UI_THEME.color.value.negative;
    default:         return UI_THEME.color.value.neutral;
  }
}

type TooltipData = {
  templateId:      string;
  name:            string;
  level?:          number;
  // Class display name. Required whenever a stats title is rendered (battle
  // hover and equip); the title shows `${className}  Lvl ${level}`.
  className?:      string;
  side:            "player" | "enemy";
  skills: Array<{
    name:      string;
    colorKind: SkillIconColorKind;
    isActive:  boolean;
  }>;
  spriteKey?: string | null;
} & Record<UnitBattleStatKey, StatValue> & {
  maxHp: StatValue;
};

interface BuildOptions {
  showSprite?:     boolean; // default true
  showStats?:      boolean; // default true
  showStatsTitle?: boolean; // default true — class+level title above the stat rows
  showSkills?:     boolean; // default true
}

export class UnitTooltip extends BaseTooltip<TooltipData> {
  constructor(scene: Phaser.Scene, bgColor?: number, bgAlpha?: number) {
    super(scene, W, bgColor, bgAlpha);
  }

  // ── Public entry points ────────────────────────────────────────────────────

  show(data: TooltipData, anchorX: number, anchorY: number, side: "left" | "right"): void {
    super.show(data, anchorX, anchorY, side);
  }

  showFixed(unit: BattleUnitSnapshot, x: number, y: number, w: number): void {
    const data = unitToData(unit);
    this.clearContent();
    const h = this.buildContent(data);
    this.bg.setSize(w, h);
    this.setPosition(x, y);
    this.setVisible(true);
  }

  // Renders the stat rows WITHOUT the class+level title. The equip screen draws
  // its own header row (see EquipmentPanel), so the title is suppressed here.
  showFixedStatsBodySnapshot(
    unit:  UnitIdentitySnapshot,
    stats: UnitStatsSnapshot,
    x: number, y: number, w: number,
  ): void {
    const data: TooltipData = {
      templateId:      unit.templateId,
      name:            unit.name,
      level:           stats.level,
      className:       unit.className,
      side:            'player',
      hp:              stats.hp,
      maxHp:           stats.maxHp,
      physicalStrength:  stats.physicalStrength,
      magicalStrength:   stats.magicalStrength,
      physicalDefense: stats.physicalDefense,
      magicalDefense:  stats.magicalDefense,
      dodge:           stats.dodge,
      block:           stats.block,
      initiative:      stats.initiative,
      skills:          [],
    };
    this.clearContent();
    const h = this.buildContent(data, { showSprite: false, showSkills: false, showStatsTitle: false });
    this.bg.setSize(w, h);
    this.setPosition(x, y);
    this.setVisible(true);
  }

  // ── Content builder ────────────────────────────────────────────────────────

  protected buildContent(data: TooltipData, opts: BuildOptions = {}): number {
    const scene  = this.scene;
    const panelW = this.tooltipW;
    const pad    = UI_THEME.component.tooltip.pad;
    let y        = pad;

    if (opts.showSprite !== false) {
      // Sprite or fallback color rect
      const spriteKey = data.spriteKey ?? null;
      if (spriteKey && scene.textures.exists(spriteKey)) {
        const img = scene.add.image(pad + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, spriteKey);
        img.setDisplaySize(SPRITE_SIZE, SPRITE_SIZE).setOrigin(0.5);
        this.add(img);
        this.contentItems.push(img);
      } else {
        const color = data.side === "player" ? BATTLE_VISUAL_THEME.unit.player : BATTLE_VISUAL_THEME.unit.enemy;
        const rect  = scene.add.rectangle(pad + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE, color);
        rect.setOrigin(0.5);
        this.add(rect);
        this.contentItems.push(rect);
      }

      // Name — to the right of sprite
      const nameColor = data.side === "player" ? BATTLE_VISUAL_THEME.unit.labelPlayer : BATTLE_VISUAL_THEME.unit.labelEnemy;
      this.addText(pad + SPRITE_SIZE + pad, y, data.name, {
        fontSize:  fontSize("md"),
        color:     nameColor,
        fontStyle: "bold",
        wordWrap:  { width: panelW - SPRITE_SIZE - pad * 3 },
      });
      y += SPRITE_SIZE + pad;

      // Divider
      this.addRect(pad, y, panelW - pad * 2, 1, UI_THEME.component.tooltip.divider);
      y += Math.round(6 * LAYOUT_SCALE);
    }

    if (opts.showStats !== false) {
    // Title shows current class + level. There is no generic "Stats" fallback:
    // any stats block that renders a title must carry className and level.
    if (opts.showStatsTitle !== false) {
      if (!data.className || data.level === undefined) {
        throw new Error('UnitTooltip stats require className and level');
      }
      this.addText(pad, y, `${data.className}  Lvl ${data.level}`, {
        fontSize: fontSize("md"), color: UI_THEME.color.value.highlight, fontStyle: "bold",
      });
      y += Math.round(18 * LAYOUT_SCALE);
    }

    const statLines: Array<{ label: string; display: string; color: string }> = [
      { label: "HP", display: `${data.hp.value} / ${data.maxHp.value}`, color: statColor(data.maxHp) },
      ...UNIT_BATTLE_STAT_KEYS
        .filter((key) => key !== 'hp')
        .map((key) => ({
          label:   STAT_PRESENTATION[key].label,
          display: formatStatValue(key, data[key].value),
          color:   statColor(data[key]),
        })),
    ];

    for (const { label, display, color } of statLines) {
      const labelObj = this.addText(pad, y, `${label}: `, { fontSize: fontSize("sm"), color: UI_THEME.color.value.neutral });
      this.addText(pad + labelObj.width, y, display, { fontSize: fontSize("sm"), color });
      y += UI_THEME.component.tooltip.lineH;
    }
    } // end showStats

    if (opts.showSkills !== false) {
      y += Math.round(6 * LAYOUT_SCALE);

      // Skills section
      this.addText(pad, y, "Skills", {
        fontSize: fontSize("md"), color: UI_THEME.color.value.highlight, fontStyle: "bold",
      });
      y += Math.round(18 * LAYOUT_SCALE);

      if (data.skills.length === 0) {
        this.addText(pad, y, "No skills", { fontSize: fontSize("sm"), color: UI_THEME.color.value.muted });
        y += UI_THEME.component.tooltip.lineH;
      } else {
        for (const skill of data.skills) {
          const nameCol =
            skill.colorKind === 'magical'  ? BATTLE_VISUAL_THEME.skill.magical  :
            skill.colorKind === 'physical' ? BATTLE_VISUAL_THEME.skill.physical :
            (skill.isActive ? UI_THEME.color.value.white : UI_THEME.color.value.inactive);
          this.addText(pad, y, skill.name, { fontSize: fontSize("sm"), color: nameCol });
          y += UI_THEME.component.tooltip.lineH;
        }
      }
    }

    return y + pad;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function unitToData(unit: BattleUnitSnapshot): TooltipData {
  const s = unit.statDisplay;
  return {
    templateId:      unit.templateId,
    name:            unit.name,
    level:           unit.statDisplay.level,
    className:       unit.className,
    side:            unit.side,
    hp:              s.hp,
    maxHp:           s.maxHp,
    physicalStrength: s.physicalStrength,
    magicalStrength:  s.magicalStrength,
    physicalDefense:  s.physicalDefense,
    magicalDefense:   s.magicalDefense,
    dodge:            s.dodge,
    block:            s.block,
    initiative:       s.initiative,
    skills: unit.skills.map((sk, i) => ({
      name:      sk.name,
      colorKind: buildSkillIconSnapshot(sk).colorKind,
      isActive:  i === unit.activeSkillIndex,
    })),
    spriteKey: unit.sprite?.textureKey ?? null,
  };
}

import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";
import { UI_THEME, fontSize } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import type { BattleUnitSnapshot } from "../shared/battleSnapshots";
import type { SkillIconColorKind } from "../shared/snapshotTypes";
import { buildSkillIconSnapshot } from "../core/unitUpgradePresentation";
import type { UnitStatsSnapshot } from '../core/phases';

const W           = Math.round(200 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64  * LAYOUT_SCALE);

interface UnitIdentitySnapshot {
  templateId: string;
  name: string;
}

interface StatValue { value: number; base: number }
function flat(v: number): StatValue { return { value: v, base: v }; }
function statColor(sv: StatValue): string {
  if (sv.value > sv.base) return UI_THEME.color.value.positive;
  if (sv.value < sv.base) return UI_THEME.color.value.negative;
  return UI_THEME.color.value.neutral;
}

interface TooltipData {
  templateId:      string;
  name:            string;
  level?:          number;
  side:            "player" | "enemy";
  hp:              StatValue;
  maxHp:           StatValue;
  physicalStrength:  StatValue;
  magicalStrength:   StatValue;
  physicalDefense: StatValue;
  magicalDefense:  StatValue;
  dodge:           StatValue;
  block:           StatValue;
  initiative:      StatValue;
  skills: Array<{
    name:      string;
    colorKind: SkillIconColorKind;
    isActive:  boolean;
  }>;
  spriteKey?: string | null;
}

interface BuildOptions {
  showSprite?:     boolean; // default true
  showStats?:      boolean; // default true
  showSkills?:     boolean; // default true
  showNameHeader?: boolean; // default false — renders "Name  Lvl N" at top
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

  showFixedNameOnly(unit: UnitIdentitySnapshot, level: number, x: number, y: number, w: number): void {
    const data: TooltipData = {
      templateId: unit.templateId, name: unit.name, level,
      side: 'player',
      hp: flat(0), maxHp: flat(0),
      physicalStrength: flat(0), magicalStrength: flat(0),
      physicalDefense: flat(0), magicalDefense: flat(0),
      dodge: flat(0), block: flat(0), initiative: flat(0),
      skills: [],
    };
    this.clearContent();
    const h = this.buildContent(data, { showNameHeader: true, showSprite: false, showStats: false, showSkills: false });
    this.bg.setSize(w, h);
    this.setPosition(x, y);
    this.setVisible(true);
  }


  showFixedStatsSnapshot(
    unit:  UnitIdentitySnapshot,
    stats: UnitStatsSnapshot,
    x: number, y: number, w: number,
  ): void {
    const data: TooltipData = {
      templateId:      unit.templateId,
      name:            unit.name,
      level:           stats.level,
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
    const h = this.buildContent(data, { showSprite: false, showSkills: false });
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

    if (opts.showNameHeader) {
      this.addText(pad, y, `${data.name}  Lvl ${data.level ?? 1}`, {
        fontSize: fontSize('md'), color: UI_THEME.color.value.highlight, fontStyle: 'bold',
      });
      y += Math.round(18 * LAYOUT_SCALE);
    }

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
    // Stats section
    this.addText(pad, y, "Stats", {
      fontSize: fontSize("md"), color: UI_THEME.color.value.highlight, fontStyle: "bold",
    });
    y += Math.round(18 * LAYOUT_SCALE);

    const statLines: Array<{ label: string; display: string; color: string }> = [
      { label: "HP",         display: `${data.hp.value} / ${data.maxHp.value}`, color: statColor(data.maxHp)           },
      { label: "Phys Str",   display: String(data.physicalStrength.value), color: statColor(data.physicalStrength)       },
      { label: "Magic Str",  display: String(data.magicalStrength.value),  color: statColor(data.magicalStrength)        },
      { label: "Phys Def",   display: `${data.physicalDefense.value}%`,  color: statColor(data.physicalDefense)      },
      { label: "Magic Def",  display: `${data.magicalDefense.value}%`,   color: statColor(data.magicalDefense)       },
      { label: "Dodge",      display: `${data.dodge.value}%`,            color: statColor(data.dodge)                },
      { label: "Block",      display: `${data.block.value}%`,            color: statColor(data.block)                },
      { label: "Initiative", display: String(data.initiative.value),     color: statColor(data.initiative)           },
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
  return {
    templateId:      unit.templateId,
    name:            unit.name,
    side:            unit.side,
    hp:              flat(unit.hp),
    maxHp:           flat(unit.maxHp),
    physicalStrength:  { value: unit.effectivePhysicalStrength,  base: unit.physicalStrength  },
    magicalStrength:   { value: unit.effectiveMagicalStrength,   base: unit.magicalStrength   },
    physicalDefense: { value: unit.effectivePhysicalDefense, base: unit.physicalDefense },
    magicalDefense:  { value: unit.effectiveMagicalDefense,  base: unit.magicalDefense  },
    dodge:           { value: unit.effectiveDodge,           base: unit.dodge           },
    block:           { value: unit.effectiveBlock,           base: unit.block           },
    initiative:      { value: unit.effectiveInitiative,      base: unit.initiative      },
    skills: unit.skills.map((s, i) => ({
      name:      s.name,
      colorKind: buildSkillIconSnapshot(s).colorKind,
      isActive:  i === unit.activeSkillIndex,
    })),
    spriteKey: unit.spriteKey,
  };
}

import Phaser from "phaser";
import { LAYOUT_SCALE, COLORS } from "../core/Constants";
import { TOOLTIP, fontSize, VALUE_COLOR } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import { Unit, UnitBlueprint } from "../battle/types";
import { effectiveStats } from "../battle/combat";

const W           = Math.round(200 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64  * LAYOUT_SCALE);
const LINE_H      = Math.round(17  * LAYOUT_SCALE);

interface StatValue { value: number; base: number }
function flat(v: number): StatValue { return { value: v, base: v }; }
function statColor(sv: StatValue): string {
  if (sv.value > sv.base) return VALUE_COLOR.positive;
  if (sv.value < sv.base) return VALUE_COLOR.negative;
  return VALUE_COLOR.neutral;
}

interface TooltipData {
  templateId:      string;
  name:            string;
  side:            "player" | "enemy";
  hp:              number;
  maxHp:           number;
  physicalDamage:  StatValue;
  magicalDamage:   StatValue;
  physicalDefense: StatValue;
  magicalDefense:  StatValue;
  dodge:           StatValue;
  block:           StatValue;
  initiative:      StatValue;
  skills: Array<{
    name:        string;
    damageBlock?: { damageType: string };
    isActive:    boolean;
  }>;
}

export class UnitTooltip extends BaseTooltip<TooltipData> {
  constructor(scene: Phaser.Scene) {
    super(scene, W);
  }

  // ── Public entry points ────────────────────────────────────────────────────

  show(data: TooltipData, anchorX: number, anchorY: number, side: "left" | "right"): void {
    super.show(data, anchorX, anchorY, side);
  }

  showUnit(unit: Unit, anchorX: number, anchorY: number): void {
    const side = unit.anchor.side === "player" ? "right" : "left";
    super.show(unitToData(unit), anchorX, anchorY, side);
  }

  showFromBlueprint(
    bp:        UnitBlueprint,
    level:     number,
    side:      "player" | "enemy",
    anchorX:   number,
    anchorY:   number,
    overrideW?: number,
  ): void {
    const scale = 1 + 0.1 * (level - 1);
    const data: TooltipData = {
      templateId:      bp.templateId,
      name:            bp.name,
      side,
      hp:              Math.round(bp.hp * scale),
      maxHp:           Math.round(bp.hp * scale),
      physicalDamage:  flat(Math.round(bp.physicalDamage  * scale)),
      magicalDamage:   flat(Math.round(bp.magicalDamage   * scale)),
      physicalDefense: flat(bp.physicalDefense),
      magicalDefense:  flat(bp.magicalDefense),
      dodge:           flat(bp.dodge),
      block:           flat(bp.block),
      initiative:      flat(bp.initiative),
      skills: bp.skills.map(s => ({
        name:        s.name,
        damageBlock: s.damageBlock,
        isActive:    false,
      })),
    };
    if (overrideW !== undefined) {
      this.clearContent();
      const h = this.buildContent(data);
      this.bg.setSize(overrideW, h);
      this.setPosition(anchorX, anchorY);
      this.setVisible(true);
    } else {
      super.show(data, anchorX, anchorY, side === "player" ? "right" : "left");
    }
  }

  showFixed(unit: Unit, x: number, y: number, w: number): void {
    const data = unitToData(unit);
    this.clearContent();
    const h = this.buildContent(data);
    this.bg.setSize(w, h);
    this.setPosition(x, y);
    this.setVisible(true);
  }

  // ── Content builder ────────────────────────────────────────────────────────

  protected buildContent(data: TooltipData): number {
    const scene  = this.scene;
    const panelW = this.tooltipW;
    const pad    = TOOLTIP.pad;
    let y        = pad;

    // Sprite or fallback color rect
    const spriteKey = `sprite-${data.templateId}`;
    if (scene.textures.exists(spriteKey)) {
      const img = scene.add.image(pad + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, spriteKey);
      img.setDisplaySize(SPRITE_SIZE, SPRITE_SIZE).setOrigin(0.5);
      this.add(img);
      this.contentItems.push(img);
    } else {
      const color = data.side === "player" ? COLORS.unitPlayer : COLORS.unitEnemy;
      const rect  = scene.add.rectangle(pad + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE, color);
      rect.setOrigin(0.5);
      this.add(rect);
      this.contentItems.push(rect);
    }

    // Name — to the right of sprite
    const nameColor = data.side === "player" ? COLORS.label : COLORS.labelEnemy;
    this.addText(pad + SPRITE_SIZE + pad, y, data.name, {
      fontSize:  fontSize("md"),
      color:     nameColor,
      fontStyle: "bold",
      wordWrap:  { width: panelW - SPRITE_SIZE - pad * 3 },
    });
    y += SPRITE_SIZE + pad;

    // Divider
    this.addRect(pad, y, panelW - pad * 2, 1, TOOLTIP.divider);
    y += Math.round(6 * LAYOUT_SCALE);

    // Stats section
    this.addText(pad, y, "Stats", {
      fontSize: fontSize("md"), color: VALUE_COLOR.highlight, fontStyle: "bold",
    });
    y += Math.round(18 * LAYOUT_SCALE);

    const statLines: Array<{ label: string; display: string; color: string }> = [
      { label: "HP",         display: `${data.hp} / ${data.maxHp}`,     color: VALUE_COLOR.neutral                  },
      { label: "Phys Dmg",   display: String(data.physicalDamage.value), color: statColor(data.physicalDamage)       },
      { label: "Magic Dmg",  display: String(data.magicalDamage.value),  color: statColor(data.magicalDamage)        },
      { label: "Phys Def",   display: `${data.physicalDefense.value}%`,  color: statColor(data.physicalDefense)      },
      { label: "Magic Def",  display: `${data.magicalDefense.value}%`,   color: statColor(data.magicalDefense)       },
      { label: "Dodge",      display: `${data.dodge.value}%`,            color: statColor(data.dodge)                },
      { label: "Block",      display: `${data.block.value}%`,            color: statColor(data.block)                },
      { label: "Initiative", display: String(data.initiative.value),     color: statColor(data.initiative)           },
    ];

    for (const { label, display, color } of statLines) {
      this.addText(pad, y, `${label}: ${display}`, { fontSize: fontSize("sm"), color });
      y += LINE_H;
    }

    y += Math.round(6 * LAYOUT_SCALE);

    // Skills section
    this.addText(pad, y, "Skills", {
      fontSize: fontSize("md"), color: VALUE_COLOR.highlight, fontStyle: "bold",
    });
    y += Math.round(18 * LAYOUT_SCALE);

    if (data.skills.length === 0) {
      this.addText(pad, y, "No skills", { fontSize: fontSize("sm"), color: "#555555" });
      y += LINE_H;
    } else {
      for (const skill of data.skills) {
        const nameCol =
          skill.damageBlock?.damageType === "magical"  ? COLORS.skillMagical  :
          skill.damageBlock?.damageType === "physical" ? COLORS.skillPhysical :
          (skill.isActive ? VALUE_COLOR.white : "#888888");
        this.addText(pad, y, skill.name, { fontSize: fontSize("sm"), color: nameCol });
        y += LINE_H;
      }
    }

    return y + pad;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function unitToData(unit: Unit): TooltipData {
  const stats = effectiveStats(unit);
  return {
    templateId:      unit.templateId,
    name:            unit.name,
    side:            unit.anchor.side,
    hp:              unit.hp,
    maxHp:           unit.maxHp,
    physicalDamage:  { value: stats.physicalDamage,  base: unit.physicalDamage  },
    magicalDamage:   { value: stats.magicalDamage,   base: unit.magicalDamage   },
    physicalDefense: { value: stats.physicalDefense, base: unit.physicalDefense },
    magicalDefense:  { value: stats.magicalDefense,  base: unit.magicalDefense  },
    dodge:           { value: stats.dodge,           base: unit.dodge           },
    block:           { value: stats.block,           base: unit.block           },
    initiative:      { value: stats.initiative,      base: unit.initiative      },
    skills: unit.skills.map((s, i) => ({
      name:        s.name,
      damageBlock: s.damageBlock,
      isActive:    i === unit.activeSkillIndex,
    })),
  };
}

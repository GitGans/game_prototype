import Phaser from "phaser";
import { LAYOUT_SCALE, COLORS } from "../core/Constants";
import { TOOLTIP, fontSize, VALUE_COLOR } from "../ui/theme";
import { BaseTooltip } from "../ui/BaseTooltip";
import { Unit } from "../battle/types";
import type { BenchUnitSnapshot } from "../shared/battleSnapshots";
import { effectiveStats } from "../battle/combat";
import type { UnitStatsSnapshot } from '../core/phases';
import { getUnitSpriteTextureKey } from '../core/unitSpriteKey';

const W           = Math.round(200 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64  * LAYOUT_SCALE);

interface UnitIdentitySnapshot {
  templateId: string;
  name: string;
}

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
  level?:          number;
  side:            "player" | "enemy";
  hp:              StatValue;
  maxHp:           StatValue;
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

  showUnit(unit: Unit, anchorX: number, anchorY: number): void {
    const side = unit.anchor.side === "player" ? "right" : "left";
    super.show(unitToData(unit), anchorX, anchorY, side);
  }

  showFixed(unit: Unit, x: number, y: number, w: number): void {
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
      physicalDamage: flat(0), magicalDamage: flat(0),
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
      physicalDamage:  stats.physicalDamage,
      magicalDamage:   stats.magicalDamage,
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

  // Bench preview represents an uninjured reserve unit for battle setup.
  showBenchSnapshot(
    snapshot: BenchUnitSnapshot,
    anchorX:  number,
    anchorY:  number,
    overrideW?: number,
  ): void {
    const data: TooltipData = {
      templateId:      snapshot.templateId,
      name:            snapshot.name,
      level:           snapshot.level,
      side:            'player',
      // Use maxHp for both — bench shows a healthy unit, not mid-battle HP
      hp:              snapshot.stats.maxHp,
      maxHp:           snapshot.stats.maxHp,
      physicalDamage:  snapshot.stats.physicalDamage,
      magicalDamage:   snapshot.stats.magicalDamage,
      physicalDefense: snapshot.stats.physicalDefense,
      magicalDefense:  snapshot.stats.magicalDefense,
      dodge:           snapshot.stats.dodge,
      block:           snapshot.stats.block,
      initiative:      snapshot.stats.initiative,
      skills: snapshot.skills.map(s => ({
        name:        s.name,
        damageBlock: s.damageType ? { damageType: s.damageType } : undefined,
        isActive:    false,
      })),
      spriteKey: snapshot.spriteKey,
    };
    if (overrideW !== undefined) {
      this.clearContent();
      const h = this.buildContent(data);
      this.bg.setSize(overrideW, h);
      this.setPosition(anchorX, anchorY);
      this.setVisible(true);
    } else {
      super.show(data, anchorX, anchorY, 'right');
    }
  }

  // ── Content builder ────────────────────────────────────────────────────────

  protected buildContent(data: TooltipData, opts: BuildOptions = {}): number {
    const scene  = this.scene;
    const panelW = this.tooltipW;
    const pad    = TOOLTIP.pad;
    let y        = pad;

    if (opts.showNameHeader) {
      this.addText(pad, y, `${data.name}  Lvl ${data.level ?? 1}`, {
        fontSize: fontSize('md'), color: VALUE_COLOR.highlight, fontStyle: 'bold',
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
    }

    if (opts.showStats !== false) {
    // Stats section
    this.addText(pad, y, "Stats", {
      fontSize: fontSize("md"), color: VALUE_COLOR.highlight, fontStyle: "bold",
    });
    y += Math.round(18 * LAYOUT_SCALE);

    const statLines: Array<{ label: string; display: string; color: string }> = [
      { label: "HP",         display: `${data.hp.value} / ${data.maxHp.value}`, color: statColor(data.maxHp)           },
      { label: "Phys Dmg",   display: String(data.physicalDamage.value), color: statColor(data.physicalDamage)       },
      { label: "Magic Dmg",  display: String(data.magicalDamage.value),  color: statColor(data.magicalDamage)        },
      { label: "Phys Def",   display: `${data.physicalDefense.value}%`,  color: statColor(data.physicalDefense)      },
      { label: "Magic Def",  display: `${data.magicalDefense.value}%`,   color: statColor(data.magicalDefense)       },
      { label: "Dodge",      display: `${data.dodge.value}%`,            color: statColor(data.dodge)                },
      { label: "Block",      display: `${data.block.value}%`,            color: statColor(data.block)                },
      { label: "Initiative", display: String(data.initiative.value),     color: statColor(data.initiative)           },
    ];

    for (const { label, display, color } of statLines) {
      const labelObj = this.addText(pad, y, `${label}: `, { fontSize: fontSize("sm"), color: VALUE_COLOR.neutral });
      this.addText(pad + labelObj.width, y, display, { fontSize: fontSize("sm"), color });
      y += TOOLTIP.lineH;
    }
    } // end showStats

    if (opts.showSkills !== false) {
      y += Math.round(6 * LAYOUT_SCALE);

      // Skills section
      this.addText(pad, y, "Skills", {
        fontSize: fontSize("md"), color: VALUE_COLOR.highlight, fontStyle: "bold",
      });
      y += Math.round(18 * LAYOUT_SCALE);

      if (data.skills.length === 0) {
        this.addText(pad, y, "No skills", { fontSize: fontSize("sm"), color: VALUE_COLOR.muted });
        y += TOOLTIP.lineH;
      } else {
        for (const skill of data.skills) {
          const nameCol =
            skill.damageBlock?.damageType === "magical"  ? COLORS.skillMagical  :
            skill.damageBlock?.damageType === "physical" ? COLORS.skillPhysical :
            (skill.isActive ? VALUE_COLOR.white : VALUE_COLOR.inactive);
          this.addText(pad, y, skill.name, { fontSize: fontSize("sm"), color: nameCol });
          y += TOOLTIP.lineH;
        }
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
    hp:              flat(unit.hp),
    maxHp:           flat(unit.maxHp),
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
    spriteKey: unit.spriteSheet
      ? getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet)
      : null,
  };
}

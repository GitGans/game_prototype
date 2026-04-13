import Phaser from "phaser";
import { LAYOUT_SCALE, COLORS, CELL_SIZE } from "../core/Constants";
import { Unit, UnitBlueprint } from "../battle/types";
import { effectiveStats } from "../battle/combat";

const W = Math.round(200 * LAYOUT_SCALE);
const PAD = Math.round(10 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64 * LAYOUT_SCALE);
const LINE_H = Math.round(17 * LAYOUT_SCALE);
const FONT_SM = `${Math.round(11 * LAYOUT_SCALE)}px`;
const FONT_MD = `${Math.round(13 * LAYOUT_SCALE)}px`;

interface StatValue {
  value: number;
  base: number;
}

interface TooltipData {
  templateId: string;
  name: string;
  side: "player" | "enemy";
  hp: number;
  maxHp: number;
  physicalDamage: StatValue;
  magicalDamage: StatValue;
  physicalDefense: StatValue;
  magicalDefense: StatValue;
  dodge: StatValue;
  block: StatValue;
  initiative: StatValue;
  skills: Array<{
    name: string;
    damageBlock?: { damageType: string };
    isActive: boolean;
  }>;
}

function statColor(sv: StatValue): string {
  if (sv.value > sv.base) return "#44ff88"; // buffed → green
  if (sv.value < sv.base) return "#ff4444"; // debuffed → red
  return "#cccccc";                          // unchanged → grey
}

function flat(v: number): StatValue { return { value: v, base: v }; }

export class UnitTooltip extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private contents: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.bg = scene.add.rectangle(0, 0, W, 20, 0x0d1520, 0.92);
    this.bg.setOrigin(0, 0);
    this.add(this.bg);
    this.setDepth(100);
    this.setVisible(false);
    scene.add.existing(this);
  }

  show(unit: Unit, anchorX: number, anchorY: number): void {
    const stats = effectiveStats(unit);
    this._render({
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
    }, anchorX, anchorY);
  }

  showFromBlueprint(
    bp: UnitBlueprint,
    level: number,
    side: "player" | "enemy",
    anchorX: number,
    anchorY: number,
    overrideW?: number,
  ): void {
    const scale = 1 + 0.1 * (level - 1);
    this._render({
      templateId:      bp.templateId,
      name:            bp.name,
      side,
      hp:              Math.round(bp.hp * scale),
      maxHp:           Math.round(bp.hp * scale),
      physicalDamage:  flat(Math.round(bp.physicalDamage * scale)),
      magicalDamage:   flat(Math.round(bp.magicalDamage  * scale)),
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
    }, anchorX, anchorY, overrideW);
  }

  hide(): void {
    this.setVisible(false);
  }

  showFixed(unit: Unit, x: number, y: number, w: number): void {
    const stats = effectiveStats(unit);
    this._render({
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
    }, x, y, w);
  }

  private _render(data: TooltipData, anchorX: number, anchorY: number, overrideW?: number): void {
    const panelW = overrideW ?? W;
    for (const obj of this.contents) obj.destroy();
    this.contents = [];

    const scene = this.scene;
    let y = PAD;

    // ── Sprite or fallback color rect ────────────────────────────────
    const spriteKey = `sprite-${data.templateId}`;
    if (scene.textures.exists(spriteKey)) {
      const img = scene.add.image(PAD + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, spriteKey);
      img.setDisplaySize(SPRITE_SIZE, SPRITE_SIZE);
      img.setOrigin(0.5, 0.5);
      this.add(img);
      this.contents.push(img);
    } else {
      const color = data.side === "player" ? COLORS.unitPlayer : COLORS.unitEnemy;
      const rect = scene.add.rectangle(PAD + SPRITE_SIZE / 2, y + SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE, color);
      rect.setOrigin(0.5, 0.5);
      this.add(rect);
      this.contents.push(rect);
    }

    // ── Name (to the right of sprite) ────────────────────────────────
    const nameColor = data.side === "player" ? "#aaddff" : "#ffaaaa";
    const nameText = scene.add.text(PAD + SPRITE_SIZE + PAD, y, data.name, {
      fontSize: FONT_MD,
      color: nameColor,
      fontStyle: "bold",
      wordWrap: { width: panelW - SPRITE_SIZE - PAD * 3 },
    });
    this.add(nameText);
    this.contents.push(nameText);
    y += SPRITE_SIZE + PAD;

    // ── Divider ───────────────────────────────────────────────────────
    const divider = scene.add.rectangle(PAD, y, panelW - PAD * 2, 1, 0x445566);
    divider.setOrigin(0, 0);
    this.add(divider);
    this.contents.push(divider);
    y += Math.round(6 * LAYOUT_SCALE);

    // ── Stats ─────────────────────────────────────────────────────────
    const statsTitle = scene.add.text(PAD, y, "Stats", {
      fontSize: FONT_MD, color: "#ffdd44", fontStyle: "bold",
    });
    this.add(statsTitle);
    this.contents.push(statsTitle);
    y += Math.round(18 * LAYOUT_SCALE);

    const statLines: Array<{ label: string; display: string; color: string }> = [
      { label: "HP",         display: `${data.hp} / ${data.maxHp}`,              color: "#cccccc"                   },
      { label: "Phys Dmg",  display: String(data.physicalDamage.value),          color: statColor(data.physicalDamage)  },
      { label: "Magic Dmg", display: String(data.magicalDamage.value),           color: statColor(data.magicalDamage)   },
      { label: "Phys Def",  display: `${data.physicalDefense.value}%`,           color: statColor(data.physicalDefense) },
      { label: "Magic Def", display: `${data.magicalDefense.value}%`,            color: statColor(data.magicalDefense)  },
      { label: "Dodge",     display: `${data.dodge.value}%`,                     color: statColor(data.dodge)           },
      { label: "Block",     display: `${data.block.value}%`,                     color: statColor(data.block)           },
      { label: "Initiative",display: String(data.initiative.value),              color: statColor(data.initiative)      },
    ];

    for (const { label, display, color } of statLines) {
      const t = scene.add.text(PAD, y, `${label}: ${display}`, {
        fontSize: FONT_SM, color,
      });
      this.add(t);
      this.contents.push(t);
      y += LINE_H;
    }

    y += Math.round(6 * LAYOUT_SCALE);

    // ── Skills ────────────────────────────────────────────────────────
    const skillTitle = scene.add.text(PAD, y, "Skills", {
      fontSize: FONT_MD, color: "#ffdd44", fontStyle: "bold",
    });
    this.add(skillTitle);
    this.contents.push(skillTitle);
    y += Math.round(18 * LAYOUT_SCALE);

    if (data.skills.length === 0) {
      const noSkill = scene.add.text(PAD, y, "No skills", {
        fontSize: FONT_SM, color: "#555555",
      });
      this.add(noSkill);
      this.contents.push(noSkill);
      y += LINE_H;
    } else {
      for (const skill of data.skills) {
        const nameCol = skill.isActive ? "#ffffff" : "#888888";
        const skillName = scene.add.text(PAD, y, skill.name, {
          fontSize: FONT_SM, color: nameCol,
        });
        this.add(skillName);
        this.contents.push(skillName);
        y += LINE_H;

        const typeStr = skill.damageBlock
          ? `Damage: ${skill.damageBlock.damageType}`
          : "Effect only";
        const skillType = scene.add.text(PAD + Math.round(8 * LAYOUT_SCALE), y, typeStr, {
          fontSize: FONT_SM, color: "#666666",
        });
        this.add(skillType);
        this.contents.push(skillType);
        y += LINE_H;
      }
    }

    y += PAD;

    // ── Resize background ─────────────────────────────────────────────
    const tooltipH = y;
    this.bg.setSize(panelW, tooltipH);

    // ── Fixed position — used by battle screen ────────────────────────
    if (overrideW !== undefined) {
      this.setPosition(anchorX, anchorY);
      this.setVisible(true);
      return;
    }

    // ── Auto-position: fixed to cell anchor, side-aware ───────────────
    const sceneW = scene.scale.width;
    const sceneH = scene.scale.height;
    const OFFSET = Math.round(16 * LAYOUT_SCALE);
    const halfCell = CELL_SIZE / 2;

    let tx: number;
    let ty = anchorY - tooltipH / 2; // vertically centred on the cell

    if (data.side === "player") {
      tx = anchorX + halfCell + OFFSET;             // right of the cell
    } else {
      tx = anchorX - panelW - halfCell - OFFSET;    // left of the cell
    }

    // Clamp to screen edges
    if (tx + panelW > sceneW) tx = sceneW - panelW - PAD;
    if (tx < 0)               tx = PAD;
    if (ty < 0)               ty = PAD;
    if (ty + tooltipH > sceneH) ty = sceneH - tooltipH - PAD;

    this.setPosition(tx, ty);
    this.setVisible(true);
  }
}

import Phaser from "phaser";
import { LAYOUT_SCALE, COLORS } from "../core/Constants";
import { Unit, UnitBlueprint } from "../battle/types";

const W = Math.round(200 * LAYOUT_SCALE);
const PAD = Math.round(10 * LAYOUT_SCALE);
const SPRITE_SIZE = Math.round(64 * LAYOUT_SCALE);
const LINE_H = Math.round(17 * LAYOUT_SCALE);
const FONT_SM = `${Math.round(11 * LAYOUT_SCALE)}px`;
const FONT_MD = `${Math.round(13 * LAYOUT_SCALE)}px`;

interface TooltipData {
  templateId: string;
  name: string;
  side: "player" | "enemy";
  hp: number;
  maxHp: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
  skill: { name: string; damageBlock?: { damageType: string } } | null;
}

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

  show(unit: Unit, cursorX: number, cursorY: number): void {
    this._render({
      templateId: unit.templateId,
      name: unit.name,
      side: unit.anchor.side,
      hp: unit.hp,
      maxHp: unit.maxHp,
      physicalDamage: unit.physicalDamage,
      magicalDamage: unit.magicalDamage,
      physicalDefense: unit.physicalDefense,
      magicalDefense: unit.magicalDefense,
      dodge: unit.dodge,
      block: unit.block,
      initiative: unit.initiative,
      skill: unit.skill ?? null,
    }, cursorX, cursorY);
  }

  showFromBlueprint(
    bp: UnitBlueprint,
    level: number,
    side: "player" | "enemy",
    cursorX: number,
    cursorY: number,
  ): void {
    const scale = 1 + 0.1 * (level - 1);
    this._render({
      templateId: bp.templateId,
      name: bp.name,
      side,
      hp: Math.round(bp.hp * scale),
      maxHp: Math.round(bp.hp * scale),
      physicalDamage: Math.round(bp.physicalDamage * scale),
      magicalDamage: Math.round(bp.magicalDamage * scale),
      physicalDefense: bp.physicalDefense,
      magicalDefense: bp.magicalDefense,
      dodge: bp.dodge,
      block: bp.block,
      initiative: bp.initiative,
      skill: bp.skill ?? null,
    }, cursorX, cursorY);
  }

  hide(): void {
    this.setVisible(false);
  }

  private _render(data: TooltipData, cursorX: number, cursorY: number): void {
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
      wordWrap: { width: W - SPRITE_SIZE - PAD * 3 },
    });
    this.add(nameText);
    this.contents.push(nameText);
    y += SPRITE_SIZE + PAD;

    // ── Divider ───────────────────────────────────────────────────────
    const divider = scene.add.rectangle(PAD, y, W - PAD * 2, 1, 0x445566);
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

    const statLines = [
      { label: "HP",         value: `${data.hp} / ${data.maxHp}` },
      { label: "Phys Dmg",   value: String(data.physicalDamage) },
      { label: "Magic Dmg",  value: String(data.magicalDamage) },
      { label: "Phys Def",   value: `${data.physicalDefense}%` },
      { label: "Magic Def",  value: `${data.magicalDefense}%` },
      { label: "Dodge",      value: `${data.dodge}%` },
      { label: "Block",      value: `${data.block}%` },
      { label: "Initiative", value: String(data.initiative) },
    ];

    for (const { label, value } of statLines) {
      const t = scene.add.text(PAD, y, `${label}: ${value}`, {
        fontSize: FONT_SM, color: "#cccccc",
      });
      this.add(t);
      this.contents.push(t);
      y += LINE_H;
    }

    y += Math.round(6 * LAYOUT_SCALE);

    // ── Skill ─────────────────────────────────────────────────────────
    const skillTitle = scene.add.text(PAD, y, "Skill", {
      fontSize: FONT_MD, color: "#ffdd44", fontStyle: "bold",
    });
    this.add(skillTitle);
    this.contents.push(skillTitle);
    y += Math.round(18 * LAYOUT_SCALE);

    if (data.skill) {
      const skillName = scene.add.text(PAD, y, data.skill.name, {
        fontSize: FONT_SM, color: "#ffffff",
      });
      this.add(skillName);
      this.contents.push(skillName);
      y += LINE_H;

      const skillType = data.skill.damageBlock
        ? `Damage: ${data.skill.damageBlock.damageType}`
        : "Effect only";
      const skillTypeText = scene.add.text(PAD, y, skillType, {
        fontSize: FONT_SM, color: "#aaaaaa",
      });
      this.add(skillTypeText);
      this.contents.push(skillTypeText);
      y += LINE_H;
    } else {
      const noSkill = scene.add.text(PAD, y, "No skill", {
        fontSize: FONT_SM, color: "#555555",
      });
      this.add(noSkill);
      this.contents.push(noSkill);
      y += LINE_H;
    }

    y += PAD;

    // ── Resize background ─────────────────────────────────────────────
    this.bg.setSize(W, y);

    // ── Position tooltip (avoid screen edges) ─────────────────────────
    const sceneW = scene.scale.width;
    const sceneH = scene.scale.height;
    const OFFSET = Math.round(12 * LAYOUT_SCALE);

    let tx = cursorX + OFFSET;
    let ty = cursorY - y - OFFSET;  // above cursor by default

    if (tx + W > sceneW) tx = cursorX - W - OFFSET;
    if (ty < 0) ty = cursorY + OFFSET;
    if (ty + y > sceneH) ty = sceneH - y - PAD;

    this.setPosition(tx, ty);
    this.setVisible(true);
  }
}

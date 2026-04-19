import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";

type EntryType = "positive" | "negative" | "neutral";

interface LogEntry {
  text: string;
  type: EntryType;
}

const MAX_VISIBLE = 20;
const COLLAPSED_H = Math.round(26 * LAYOUT_SCALE);
const LINE_H = Math.round(18 * LAYOUT_SCALE);
const PAD = Math.round(6 * LAYOUT_SCALE);
const FONT_SIZE = Math.round(11 * LAYOUT_SCALE);

const COLOR_BG = 0xd8d8d8;
const COLOR_POSITIVE = "#1a8c1a";
const COLOR_NEGATIVE = "#aa2222";
const COLOR_NEUTRAL = "#555555";
const COLOR_BTN = "#333333";

function entryColor(type: EntryType): string {
  if (type === "positive") return COLOR_POSITIVE;
  if (type === "negative") return COLOR_NEGATIVE;
  return COLOR_NEUTRAL;
}

export class BattleLog extends Phaser.GameObjects.Container {
  private entries: LogEntry[] = [];
  private expanded = false;
  private panelW: number;

  // Collapsed layer
  private collapsedBg!: Phaser.GameObjects.Rectangle;
  private collapsedText!: Phaser.GameObjects.Text;
  private collapsedBtn!: Phaser.GameObjects.Text;

  // Expanded layer
  private expandedBg!: Phaser.GameObjects.Rectangle;
  private expandedBtn!: Phaser.GameObjects.Text;
  private lineTexts: Phaser.GameObjects.Text[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
  ) {
    super(scene, x, y);
    this.panelW = width;
    scene.add.existing(this);
    this.buildCollapsed();
    this.buildExpanded();
    this.showCollapsed();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  addEntry(text: string, type: EntryType): void {
    this.entries.push({ text, type });
    this.refresh();
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  private buildCollapsed(): void {
    this.collapsedBg = this.scene.add
      .rectangle(0, 0, this.panelW, COLLAPSED_H, COLOR_BG, 0.92)
      .setOrigin(0, 0);

    this.collapsedText = this.scene.add
      .text(PAD, COLLAPSED_H / 2, "", {
        fontSize: `${FONT_SIZE}px`,
        color: COLOR_NEUTRAL,
      })
      .setOrigin(0, 0.5);

    this.collapsedBtn = this.scene.add
      .text(this.panelW - PAD, COLLAPSED_H / 2, "[▼]", {
        fontSize: `${FONT_SIZE}px`,
        color: COLOR_BTN,
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.expand());

    this.collapsedBg.setInteractive({ useHandCursor: true }).on("pointerup", () => this.expand());

    this.add([this.collapsedBg, this.collapsedText, this.collapsedBtn]);
  }

  private buildExpanded(): void {
    const expandedH = COLLAPSED_H + MAX_VISIBLE * LINE_H + PAD;

    this.expandedBg = this.scene.add
      .rectangle(0, 0, this.panelW, expandedH, COLOR_BG, 0.95)
      .setOrigin(0, 0);

    this.expandedBtn = this.scene.add
      .text(this.panelW - PAD, PAD, "[▲]", {
        fontSize: `${FONT_SIZE}px`,
        color: COLOR_BTN,
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.collapse());

    // Pre-create MAX_VISIBLE text objects
    for (let i = 0; i < MAX_VISIBLE; i++) {
      const t = this.scene.add
        .text(PAD, COLLAPSED_H + i * LINE_H + PAD / 2, "", {
          fontSize: `${FONT_SIZE}px`,
          color: COLOR_NEUTRAL,
          wordWrap: { width: this.panelW - PAD * 2 },
        })
        .setOrigin(0, 0);
      this.lineTexts.push(t);
    }

    this.add([this.expandedBg, this.expandedBtn, ...this.lineTexts]);
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  private showCollapsed(): void {
    this.collapsedBg.setVisible(true);
    this.collapsedText.setVisible(true);
    this.collapsedBtn.setVisible(true);
    this.expandedBg.setVisible(false);
    this.expandedBtn.setVisible(false);
    for (const t of this.lineTexts) t.setVisible(false);
  }

  private showExpanded(): void {
    this.collapsedBg.setVisible(false);
    this.collapsedText.setVisible(false);
    this.collapsedBtn.setVisible(false);
    this.expandedBg.setVisible(true);
    this.expandedBtn.setVisible(true);
    for (const t of this.lineTexts) t.setVisible(true);
  }

  expand(): void {
    this.expanded = true;
    this.showExpanded();
    this.refresh();
  }

  collapse(): void {
    this.expanded = false;
    this.showCollapsed();
    this.refresh();
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  private refresh(): void {
    if (this.expanded) {
      this.refreshExpanded();
    } else {
      this.refreshCollapsed();
    }
  }

  private refreshCollapsed(): void {
    const last = this.entries[this.entries.length - 1];
    if (last) {
      this.collapsedText.setText(last.text).setColor(entryColor(last.type));
    } else {
      this.collapsedText.setText("").setColor(COLOR_NEUTRAL);
    }
  }

  private refreshExpanded(): void {
    const visible = this.entries.slice(-MAX_VISIBLE);
    for (let i = 0; i < MAX_VISIBLE; i++) {
      const entry = visible[i];
      if (entry) {
        this.lineTexts[i].setText(entry.text).setColor(entryColor(entry.type));
      } else {
        this.lineTexts[i].setText("");
      }
    }
  }
}

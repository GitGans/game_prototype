import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';

export type BenchCardMode = 'placement' | 'battle';

export interface BenchCardCallbacks {
  onClick?:       () => void;
  onHoverStart?:  (snapshot: BattleUnitSnapshot) => void;
  onHoverEnd?:    () => void;
}

export interface BenchCardConfig {
  scene:      Phaser.Scene;
  x:          number;              // center X in world space
  y:          number;              // center Y in world space
  width:      number;
  height:     number;
  snapshot:   BattleUnitSnapshot | null;
  selected:   boolean;             // passed from phase; valid for the card's lifetime
  mode:       BenchCardMode;
  callbacks?: BenchCardCallbacks;
}

export class BenchCard extends Phaser.GameObjects.Container {
  constructor(cfg: BenchCardConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.setSize(cfg.width, cfg.height);

    if (cfg.snapshot === null) {
      this.buildEmptySlot(cfg);
    } else {
      this.buildOccupiedSlot(cfg, cfg.snapshot);
    }

    cfg.scene.add.existing(this);
  }

  // ── Empty slot ───────────────────────────────────────────────────────────────

  private buildEmptySlot(cfg: BenchCardConfig): void {
    const thickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));

    const border = cfg.scene.add.rectangle(0, 0, cfg.width, cfg.height, BATTLE_VISUAL_THEME.cell.border);
    const bg     = cfg.scene.add.rectangle(
      0, 0,
      cfg.width  - thickness,
      cfg.height - thickness,
      BATTLE_VISUAL_THEME.bench.empty, 0.5,
    );

    if (cfg.mode === 'battle') {
      border.setVisible(false);
      bg.setVisible(false);
    }

    this.add([border, bg]);

    if (cfg.mode === 'placement' && cfg.callbacks?.onClick) {
      this.setInteractive({ useHandCursor: true });
      this.on('pointerup', cfg.callbacks.onClick);
    }
  }

  // ── Occupied slot ────────────────────────────────────────────────────────────

  private buildOccupiedSlot(cfg: BenchCardConfig, snapshot: BattleUnitSnapshot): void {
    const thickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));
    const fillColor = cfg.selected ? BATTLE_VISUAL_THEME.bench.selected : BATTLE_VISUAL_THEME.bench.bg;

    // Border + background — two-rect pattern required: bg fill changes on hover/selected
    const border = cfg.scene.add.rectangle(0, 0, cfg.width, cfg.height, BATTLE_VISUAL_THEME.cell.border);
    const bg     = cfg.scene.add.rectangle(
      0, 0,
      cfg.width  - thickness,
      cfg.height - thickness,
      fillColor, 0.9,
    );

    // Sprite (frame 0 = idle) with graceful fallback
    const spriteKey = snapshot.sprite?.textureKey ?? null;
    const sprite = spriteKey && cfg.scene.textures.exists(spriteKey)
      ? cfg.scene.add.image(0, 0, spriteKey)
          .setFrame(0)
          .setDisplaySize(cfg.width - 2, cfg.height - 2)
      : null;

    // Name
    const nameText = cfg.scene.add.text(
      0,
      -cfg.height / 2 + Math.round(10 * LAYOUT_SCALE),
      snapshot.name,
      {
        fontSize:        `${Math.round(11 * LAYOUT_SCALE)}px`,
        color:           BATTLE_VISUAL_THEME.unit.labelPlayer,
        fontStyle:       'bold',
        align:           'center',
        stroke:          '#000000',
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
        wordWrap:        { width: cfg.width - 8 },
      },
    ).setOrigin(0.5, 0);

    // HP — runtime hp/maxHp, so mid-battle damage and healing reflect on the card.
    const hp    = snapshot.currentHp;
    const maxHp = snapshot.maxHp;
    const barW = cfg.width  - Math.round(12 * LAYOUT_SCALE);
    const barH = Math.round(6  * LAYOUT_SCALE);
    const barY = cfg.height / 2 - Math.round(10 * LAYOUT_SCALE);

    const hpText = cfg.scene.add.text(
      0,
      barY - Math.round(14 * LAYOUT_SCALE),
      `${hp}/${maxHp}`,
      {
        fontSize:        `${Math.round(11 * LAYOUT_SCALE)}px`,
        color:           BATTLE_VISUAL_THEME.unit.textDark,
        align:           'center',
        stroke:          '#000000',
        strokeThickness: Math.round(2 * LAYOUT_SCALE),
      },
    ).setOrigin(0.5, 0);

    // HP bar — manual rects to preserve bench-specific colors (differ from HP_COLOR; see BATTLE_VISUAL_THEME.bench).
    const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const hpBarBg = cfg.scene.add.rectangle(0,         barY, barW,            barH, BATTLE_VISUAL_THEME.bench.hpBg);
    const hpBarFg = cfg.scene.add.rectangle(-barW / 2, barY, barW * hpRatio,  barH, BATTLE_VISUAL_THEME.bench.hpFg)
      .setOrigin(0, 0.5);

    // Compose children
    const children: Phaser.GameObjects.GameObject[] = [border, bg];
    if (sprite) children.push(sprite);
    children.push(nameText, hpText, hpBarBg, hpBarFg);
    this.add(children);

    // Battle mode: sprite-only — hide all chrome
    if (cfg.mode === 'battle') {
      border.setVisible(false);
      bg.setVisible(false);
      nameText.setVisible(false);
      hpText.setVisible(false);
      hpBarBg.setVisible(false);
      hpBarFg.setVisible(false);
      return;
    }

    // Placement mode: hover + click
    // cfg.selected is construction-time; correct because buildBenchPanel() destroys and
    // recreates all cards on every placement state change — no PhaseManager read needed.
    this.setInteractive({ useHandCursor: true });

    if (cfg.callbacks?.onClick) {
      this.on('pointerup', cfg.callbacks.onClick);
    }

    this.on('pointerover', () => {
      if (!cfg.selected) bg.setFillStyle(BATTLE_VISUAL_THEME.bench.hover, 0.9);
      cfg.callbacks?.onHoverStart?.(snapshot);
    });

    this.on('pointerout', () => {
      if (!cfg.selected) bg.setFillStyle(fillColor, 0.9);
      cfg.callbacks?.onHoverEnd?.();
    });
  }
}

import Phaser from 'phaser';
import { GamePhase } from '../../core/phases';
import { ItemSlotSnapshot } from '../../shared/snapshotTypes';
import { scaled } from '../../ui/layout';
import { UI_THEME } from '../../ui/theme';
import { ITEM_VISUAL_THEME } from '../itemVisualTheme';
import { Button } from '../../ui/Button';
import { UnitTooltip } from '../UnitTooltip';
import { EquipmentMatrix } from '../EquipmentMatrix';
import { BackpackRow } from '../BackpackRow';
import { SkillIconRow } from '../SkillIconRow';
import { ItemTooltip } from '../ItemTooltip';

type AnyEquipPhase = Extract<GamePhase, { type: 'equip_screen' }>
                   | Extract<GamePhase, { type: 'debug_equip_screen' }>;

export interface EquipmentPanelConfig {
  scene:              Phaser.Scene;
  screenW:            number;
  /** Absolute Y where the header row starts (tabs are above this). */
  contentTopY:        number;
  phase:              AnyEquipPhase;
  itemTooltip:        ItemTooltip;
  onEquipSlotClick:   (slot: string, item: ItemSlotSnapshot | null) => void;
  onBackpackItemClick: (item: ItemSlotSnapshot, cellX: number, cellY: number) => void;
  onUpgrade:          () => void;
  onBack:             () => void;
}

// Layout — all internal to this panel
const CELL_SIZE     = scaled(56);
const CELL_GAP      = scaled(6);
const SPRITE_SZ     = scaled(256);
const PAD           = scaled(16);
const HEADER_H      = scaled(24);
const STATS_W       = scaled(200);
const SKILLS_W      = scaled(200);
const MATRIX_W      = 3 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
const MATRIX_H      = 4 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
const BACKPACK_COLS = 12;
const BACKPACK_ROWS = 2;

export class EquipmentPanel {
  private scene:      Phaser.Scene;
  private statsPanel: UnitTooltip;
  private namePanel:  UnitTooltip;
  private matrix:     EquipmentMatrix;
  private backpack:   BackpackRow;
  private skillRow:   SkillIconRow;

  private readonly statsX:          number;
  private readonly statsY:          number;
  private readonly spriteX:         number;
  private readonly namePanelY:      number;
  private readonly skillX:          number;
  private readonly skillY:          number;
  private readonly backpackBottomY: number;

  constructor(cfg: EquipmentPanelConfig) {
    const { scene, screenW, contentTopY, phase, itemTooltip,
            onEquipSlotClick, onBackpackItemClick, onUpgrade, onBack } = cfg;
    this.scene = scene;

    // ── Layout math ─────────────────────────────────────────────────────────
    const totalContentW = STATS_W + PAD + MATRIX_W + PAD + SPRITE_SZ + PAD + SKILLS_W;
    const startX        = Math.round((screenW - totalContentW) / 2);
    const panelTopY     = contentTopY + HEADER_H;

    const statsX  = startX;
    const matrixX = startX + STATS_W + PAD;
    const spriteX = matrixX + MATRIX_W + PAD;
    const skillX  = spriteX + SPRITE_SZ + PAD;

    this.statsX     = statsX;
    this.statsY     = contentTopY;
    this.spriteX    = spriteX;
    this.namePanelY = contentTopY;
    this.skillX     = skillX;
    this.skillY     = panelTopY;

    // ── "Items" header ───────────────────────────────────────────────────────
    scene.add.text(matrixX, contentTopY, 'Items', {
      fontSize:  `${scaled(13)}px`,
      color:     UI_THEME.color.value.highlight,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    // ── Stats panel (left column) ────────────────────────────────────────────
    this.statsPanel = new UnitTooltip(scene);

    // ── Equipment matrix (center-left) ───────────────────────────────────────
    this.matrix = new EquipmentMatrix(
      scene, matrixX, panelTopY, CELL_SIZE, CELL_GAP,
      phase.unitEquipment, itemTooltip,
      onEquipSlotClick,
    );

    // ── Unit name header (center, transparent bg) ────────────────────────────
    this.namePanel = new UnitTooltip(scene, 0x000000, 0);

    // ── Unit sprite preview (center) ─────────────────────────────────────────
    this._renderSprite(phase.selectedUnitSpriteKey, spriteX, panelTopY);

    // ── Upgrade button (top-right of sprite area) ────────────────────────────
    const BTN_SZ = scaled(32);
    new Button({
      scene,
      x:       spriteX + SPRITE_SZ - BTN_SZ / 2,
      y:       panelTopY + BTN_SZ / 2,
      w:       BTN_SZ,
      h:       BTN_SZ,
      label:   '↑',
      style:   'neutral',
      onClick: onUpgrade,
    });

    // ── "Skills" header ───────────────────────────────────────────────────────
    scene.add.text(skillX, contentTopY, 'Skills', {
      fontSize:  `${scaled(13)}px`,
      color:     UI_THEME.color.value.highlight,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    // ── Skills panel (right column) ───────────────────────────────────────────
    this.skillRow = new SkillIconRow(scene, skillX, panelTopY);

    // ── Backpack (below all four columns) ────────────────────────────────────
    const contentH    = Math.max(MATRIX_H, SPRITE_SZ);
    const backpackY   = panelTopY + contentH + Math.round(PAD / 2);
    const backpackW   = BACKPACK_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const backpackX   = Math.round((screenW - backpackW) / 2);
    this.backpack = new BackpackRow(
      scene, backpackX, backpackY, CELL_SIZE, CELL_GAP,
      phase.backpack, itemTooltip,
      onBackpackItemClick,
      BACKPACK_COLS, BACKPACK_ROWS,
    );

    const backpackBottomY    = backpackY + BACKPACK_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    this.backpackBottomY     = backpackBottomY;

    // ── Back button ───────────────────────────────────────────────────────────
    new Button({
      scene,
      x:       screenW - PAD - scaled(22),
      y:       backpackBottomY - scaled(17),
      w:       scaled(44),
      h:       scaled(34),
      label:   '←',
      style:   'neutral',
      onClick: onBack,
    });

    // ── Initial data render ───────────────────────────────────────────────────
    this.refresh(phase);
  }

  refresh(phase: AnyEquipPhase): void {
    const { selectedUnit, unitStats } = phase;
    if (!selectedUnit || !unitStats) return;

    this.statsPanel.showFixedStatsSnapshot(
      selectedUnit, unitStats, this.statsX, this.statsY, STATS_W,
    );
    this.namePanel.showFixedNameOnly(
      selectedUnit, this.spriteX, this.namePanelY, SPRITE_SZ,
    );
    this.matrix.refresh(phase.unitEquipment);
    this.backpack.refresh(phase.backpack);
    this.skillRow.setPosition(this.skillX, this.skillY);
    this.skillRow.render(phase.upgradeSkills);
  }

  getContentBottomY(): number {
    return this.backpackBottomY;
  }

  destroy(): void {
    this.statsPanel.destroy();
    this.namePanel.destroy();
    this.matrix.destroy();
    this.backpack.destroy();
    this.skillRow.destroy();
    // TODO Stage 7: track upgrade button, back button, and header text nodes
    // for explicit cleanup when switching modes mid-session.
  }

  private _renderSprite(spriteKey: string | null, x: number, y: number): void {
    if (spriteKey && this.scene.textures.exists(spriteKey)) {
      this.scene.add.image(x + SPRITE_SZ / 2, y + SPRITE_SZ / 2, spriteKey)
        .setDisplaySize(SPRITE_SZ, SPRITE_SZ)
        .setOrigin(0.5);
    } else {
      this.scene.add.rectangle(x + SPRITE_SZ / 2, y + SPRITE_SZ / 2, SPRITE_SZ, SPRITE_SZ, ITEM_VISUAL_THEME.equipmentPlaceholder);
    }
  }
}

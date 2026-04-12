import Phaser from "phaser";
import {
  CELL_SIZE,
  CELL_GAP,
  GRID_COLS,
  GRID_ROWS,
  SIDE_GAP,
  BENCH_PANEL_WIDTH,
  BENCH_GAP,
  BENCH_SLOTS,
  COLORS,
  LAYOUT_SCALE,
} from "../core/Constants";
import { EventBus, Events } from "../core/EventBus";
import { GameState } from "../core/GameState";
import { CellView } from "../objects/CellView";
import { UnitView } from "../objects/UnitView";
import { InitiativeBar } from "../objects/InitiativeBar";
import { BattleLog } from "../objects/BattleLog";
import { UnitTooltip } from "../objects/UnitTooltip";
import {
  BattleState,
  CellCoord,
  ResolvedHitCell,
  Side,
  Unit,
  UnitBlueprint,
  SpriteSheetConfig,
} from "../battle/types";
import { PLAYER_UNITS, ENEMY_UNITS } from "../data/unitDefinitions";
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import { canPlace, placeUnit } from "../battle/placement";
import { buildOccupancy } from "../battle/occupancy";
import {
  getMeleeTargets,
  getRangedTargets,
  getFriendlyTargets,
  getSelfTarget,
} from "../battle/targeting";
import { resolveAttack, resolveHeal, checkGameOver, applyEffectBlock, tickEffects, EffectEvent } from "../battle/combat";
import { resolvePattern, PATTERNS } from "../battle/skillPatterns";
import { buildRoundQueue, pruneQueue } from "../battle/initiative";
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  createUnitInstance,
  blueprintFromUnit,
  getPlayerAverageLevel,
} from "../battle/autoPlace";

/**
 * Resolves the pattern of a unit's skill relative to a target anchor cell.
 * Falls back to PATTERNS.single if the unit has no skill attached.
 * Used by all combat paths: manual, auto, quick.
 */
function getHitCells(attacker: Unit, anchor: CellCoord): ResolvedHitCell[] {
  const pattern = attacker.skill?.damageBlock?.pattern ?? PATTERNS.single;
  return resolvePattern(anchor, pattern);
}

/**
 * Compute one turn for the given unit and return the resulting BattleState.
 * Pure — no Phaser calls, no animations. Used by runQuickBattle().
 */
function computeOneTurn(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit) return state;

  const side = unit.anchor.side;
  const skill = unit.skill;

  if (skill.actionType === "mass_enchantment" || skill.actionType === "self_enchantment") {
    const targets =
      skill.actionType === "self_enchantment"
        ? getSelfTarget(unit)
        : getFriendlyTargets(side, state.occupancy);
    if (targets.length === 0) return state;
    const target = targets.reduce((best, coord) => {
      const u = state.occupancy.cellToUnit.get(cellKey(coord));
      const bestU = state.occupancy.cellToUnit.get(cellKey(best));
      return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp ? coord : best;
    });
    let next = resolveHeal(getHitCells(unit, target), unit.magicalDamage, state);
    if (skill.effectBlock) {
      next = applyEffectBlock(skill.effectBlock, target, next).state;
    }
    return next;
  }

  const targets =
    skill.actionType === "ranged"
      ? getRangedTargets(side, state.occupancy)
      : getMeleeTargets(unit, state.occupancy);

  if (targets.length === 0) return state;

  const target = targets[Math.floor(Math.random() * targets.length)];
  const damageType = skill.damageBlock?.damageType ?? "physical";
  const baseDamage = damageType === "physical" ? unit.physicalDamage : unit.magicalDamage;

  let next = state;
  if (skill.damageBlock) {
    next = resolveAttack(getHitCells(unit, target), baseDamage, damageType, state).state;
  }
  if (skill.effectBlock) {
    next = applyEffectBlock(skill.effectBlock, target, next).state;
  }
  return next;
}

export class Game extends Phaser.Scene {
  private cellViews: Map<string, CellView> = new Map();
  private unitViews: Map<string, UnitView> = new Map();
  private initiativeBar!: InitiativeBar;
  private statusText!: Phaser.GameObjects.Text;
  private battleLog!: BattleLog;
  private unitTooltip!: UnitTooltip;
  private logX = 0;
  private logY = 0;
  private logW = 0;
  private logH = 0;

  // Delays (ms)
  private static readonly DELAY_ENEMY_THINK = 700;
  private static readonly DELAY_AUTO_THINK = 200;
  private static readonly DELAY_NEXT_TURN = 500;
  private static readonly DELAY_AUTO_NEXT = 150;
  private static readonly DELAY_GAMEOVER = 600;

  // Placement phase UI
  private benchCards: Phaser.GameObjects.Container[] = [];
  private startBattleBtn: Phaser.GameObjects.Container | null = null;
  private autoBattleButtons: Phaser.GameObjects.Container[] = [];
  private chargedThisRound = new Set<string>();
  private manualTurnButtons: Phaser.GameObjects.Container[] = [];
  private chargeBtn: Phaser.GameObjects.Container | null = null;
  private selectedBenchIdx: number | null = null;
  private selectedFieldUnitId: string | null = null;
  private pendingTargetCoord: CellCoord | null = null;
  private lastClickCoordKey: string | null = null;
  private lastClickTime = 0;

  // Counter for generating unique unit IDs during placement
  private playerIdCounter = 0;

  constructor() {
    super("Game");
  }

  create(): void {
    GameState.reset();
    this.unitViews.clear();

    this.buildGrid();
    this.unitTooltip = new UnitTooltip(this);
    this.initBattle();
    this.buildUnitViews();
    this.buildUI();
    this.setupInput();
    this.enterPlacementPhase();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  // ─── Grid Layout ───────────────────────────────────────────────────────────

  private cellPixelPos(
    side: Side,
    row: number,
    col: number,
  ): { x: number; y: number } {
    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const totalGridH = GRID_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const canvasW = this.scale.width;
    const canvasH = this.scale.height;

    const leftGridX = canvasW / 2 - SIDE_GAP / 2 - totalGridW;
    const rightGridX = canvasW / 2 + SIDE_GAP / 2;
    const gridY = (canvasH - totalGridH) / 2 + Math.round(50 * LAYOUT_SCALE);

    const rowOffset =
      side === "player"
        ? (GRID_ROWS - 1 - row) * (CELL_SIZE + CELL_GAP)
        : row * (CELL_SIZE + CELL_GAP);

    const gridX = side === "player" ? leftGridX : rightGridX;
    const x = gridX + rowOffset + CELL_SIZE / 2;
    const y =
      gridY + (GRID_COLS - 1 - col) * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
    return { x, y };
  }

  private buildGrid(): void {
    for (const side of ["player", "enemy"] as Side[]) {
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const coord: CellCoord = {
            side,
            row: row as 0 | 1,
            col: col as 0 | 1 | 2,
          };
          const { x, y } = this.cellPixelPos(side, row, col);
          const cell = new CellView(this, x, y, coord);
          this.cellViews.set(cellKey(coord), cell);
        }
      }
    }

  }

  // ─── Battle Initialisation ─────────────────────────────────────────────────

  private initBattle(): void {
    const data = this.scene.settings.data as { replay?: boolean } | undefined;
    const isReplay = data?.replay === true;

    let state = GameState.get();
    state = autoPlacePlayer(state);
    state = autoPlaceEnemies(
      state,
      getPlayerAverageLevel(state),
      isReplay ? (GameState.lastEnemyRace ?? undefined) : undefined,
    );

    // Determine the highest player instance counter used so we can continue from there
    this.playerIdCounter = state.units.size; // rough upper bound; refined below
    let maxP = 0;
    for (const id of state.units.keys()) {
      if (id.startsWith("p")) {
        const n = parseInt(id.slice(1), 10);
        if (!isNaN(n) && n > maxP) maxP = n;
      }
    }
    this.playerIdCounter = maxP;

    GameState.set(state);
  }

  // ─── Unit Views ────────────────────────────────────────────────────────────

  private buildUnitViews(): void {
    const state = GameState.get();
    for (const unit of state.units.values()) {
      this.createUnitView(unit);
    }
  }

  private createUnitView(unit: Unit): void {
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    const rowSpan =
      Math.max(...cells.map((c) => c.row)) -
      Math.min(...cells.map((c) => c.row)) +
      1;
    const colSpan =
      Math.max(...cells.map((c) => c.col)) -
      Math.min(...cells.map((c) => c.col)) +
      1;

    const positions = cells.map((c) => this.cellPixelPos(c.side, c.row, c.col));
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

    const { key: textureKey, config: spriteConfig } =
      this.getSpriteKeyAndConfig(unit);
    const view = new UnitView(
      this,
      cx,
      cy,
      unit,
      colSpan,
      rowSpan,
      textureKey,
      spriteConfig,
    );
    this.unitViews.set(unit.id, view);
  }

  private destroyUnitView(unitId: string): void {
    const view = this.unitViews.get(unitId);
    if (view) {
      view.destroy();
      this.unitViews.delete(unitId);
    }
  }

  private getSpriteKeyAndConfig(unit: Unit): {
    key: string | undefined;
    config: SpriteSheetConfig | undefined;
  } {
    const allBlueprints = [
      ...PLAYER_UNITS,
      ...Object.values(ENEMY_UNITS).flat(),
    ];
    const bp = allBlueprints.find((b) => b.templateId === unit.templateId);
    if (!bp?.spriteSheet) return { key: undefined, config: undefined };
    return {
      key: `sprite-${unit.templateId}`,
      config: bp.spriteSheet,
    };
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.initiativeBar = new InitiativeBar(
      this,
      0,
      Math.round(8 * LAYOUT_SCALE),
    );

    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const rightGridRightEdge = this.scale.width / 2 + SIDE_GAP / 2 + totalGridW;
    const logGap = Math.round(10 * LAYOUT_SCALE);
    this.logX = rightGridRightEdge + logGap;
    this.logY = this.cellPixelPos("enemy", 0, 2).y - CELL_SIZE / 2;
    this.logW = this.scale.width - this.logX - logGap;
    this.logH = this.cellPixelPos("enemy", 0, 0).y + CELL_SIZE / 2 - this.logY;
    this.battleLog = new BattleLog(this, this.logX, this.logY, this.logW, this.logH);
    this.battleLog.setVisible(false);

    this.statusText = this.add
      .text(
        this.logX + this.logW / 2,
        this.logY + Math.round(26 * LAYOUT_SCALE) + Math.round(8 * LAYOUT_SCALE),
        "",
        {
          fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
          color: COLORS.textLight,
          align: "center",
          wordWrap: { width: this.logW },
        },
      )
      .setOrigin(0.5, 0);
  }

  private setStatus(msg: string): void {
    this.statusText.setText(msg);
  }

  // ─── Placement Phase ───────────────────────────────────────────────────────

  private enterPlacementPhase(): void {
    this.setStatus('Place your troops and click "Battle"');
    this.battleLog.setVisible(false);
    this.buildBenchPanel();
    this.buildStartBattleButton();
  }

  private benchCardHeight(): number {
    return CELL_SIZE;
  }

  private benchPanelX(): number {
    return BENCH_GAP + BENCH_PANEL_WIDTH / 2;
  }

  private buildBenchPanel(interactive = true): void {
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];

    const state = GameState.get();
    const cardH = this.benchCardHeight();
    const panelX = this.benchPanelX();
    const slotGap = CELL_GAP;

    // Vertically center 3 slots aligned with the player grid
    const gridTopY = this.cellPixelPos("player", 0, 2).y - CELL_SIZE / 2;
    const gridBottomY = this.cellPixelPos("player", 0, 0).y + CELL_SIZE / 2;
    const totalH = BENCH_SLOTS * cardH + (BENCH_SLOTS - 1) * slotGap;
    const startY = (gridTopY + gridBottomY) / 2 - totalH / 2 + cardH / 2;

    for (let i = 0; i < BENCH_SLOTS; i++) {
      const bp = state.benchUnits[i] ?? null;
      const cardY = startY + i * (cardH + slotGap);
      const isSelected = this.selectedBenchIdx === i;
      const card = this.makeBenchCard(bp, i, panelX, cardY, isSelected, interactive);
      this.benchCards.push(card);
    }
  }

  private makeBenchCard(
    bp: UnitBlueprint | null,
    idx: number,
    x: number,
    y: number,
    selected: boolean,
    interactive = true,
  ): Phaser.GameObjects.Container {
    const cardH = this.benchCardHeight();
    const borderThickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));

    // ── Empty slot ──────────────────────────────────────────────────────────
    if (bp === null) {
      const emptyBorder = this.add.rectangle(0, 0, BENCH_PANEL_WIDTH, cardH, COLORS.cellBorder);
      const emptyBg = this.add.rectangle(
        0, 0,
        BENCH_PANEL_WIDTH - borderThickness, cardH - borderThickness,
        COLORS.benchEmpty, 0.5,
      );
      if (!interactive) {
        emptyBorder.setVisible(false);
        emptyBg.setVisible(false);
      }
      const container = this.add.container(x, y, [emptyBorder, emptyBg]);
      container.setSize(BENCH_PANEL_WIDTH, cardH);
      if (interactive) {
        container.setInteractive({ useHandCursor: true });
        container.on("pointerup", () => this.onBenchCardClick(idx));
      }
      return container;
    }

    // ── Occupied slot ───────────────────────────────────────────────────────
    const fillColor = selected ? COLORS.benchSelected : COLORS.bench;

    // Border + background (same two-rect pattern as CellView)
    const rect = this.add.rectangle(0, 0, BENCH_PANEL_WIDTH, cardH, COLORS.cellBorder);
    const bg = this.add.rectangle(
      0, 0,
      BENCH_PANEL_WIDTH - borderThickness, cardH - borderThickness,
      fillColor, 0.9,
    );

    // Sprite (frame 0 = idle) — only when texture is loaded for this blueprint
    const spriteKey = `sprite-${bp.templateId}`;
    const spriteObj =
      bp.spriteSheet && this.textures.exists(spriteKey)
        ? this.add.image(0, 0, spriteKey).setFrame(0).setDisplaySize(BENCH_PANEL_WIDTH - 2, cardH - 2)
        : null;

    // Name
    const nameText = this.add.text(
      0, -cardH / 2 + Math.round(10 * LAYOUT_SCALE),
      bp.name,
      {
        fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
        color: COLORS.label,
        fontStyle: "bold",
        align: "center",
        stroke: "#000000",
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
        wordWrap: { width: BENCH_PANEL_WIDTH - 8 },
      },
    ).setOrigin(0.5, 0);

    // HP text + HP bar
    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const scaledHp = Math.round(bp.hp * (1 + 0.1 * (level - 1)));
    const barW = BENCH_PANEL_WIDTH - Math.round(12 * LAYOUT_SCALE);
    const barH = Math.round(6 * LAYOUT_SCALE);
    const barY = cardH / 2 - Math.round(10 * LAYOUT_SCALE);

    const hpText = this.add.text(
      0, barY - Math.round(14 * LAYOUT_SCALE),
      `${scaledHp}/${scaledHp}`,
      {
        fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
        color: COLORS.textDark,
        align: "center",
        stroke: "#000000",
        strokeThickness: Math.round(2 * LAYOUT_SCALE),
      },
    ).setOrigin(0.5, 0);

    const hpBarBg = this.add.rectangle(0, barY, barW, barH, COLORS.hpBarBg);
    const hpBarFg = this.add.rectangle(-barW / 2, barY, barW, barH, COLORS.hpBarFg).setOrigin(0, 0.5);

    const children: Phaser.GameObjects.GameObject[] = spriteObj
      ? [rect, bg, spriteObj, nameText, hpText, hpBarBg, hpBarFg]
      : [rect, bg, nameText, hpText, hpBarBg, hpBarFg];
    const container = this.add.container(x, y, children);
    container.setSize(BENCH_PANEL_WIDTH, cardH);

    if (interactive) {
      container.setInteractive({ useHandCursor: true });
      container.on("pointerup", () => this.onBenchCardClick(idx));
      container.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        if (this.selectedBenchIdx !== idx) bg.setFillStyle(0x2a3a4a, 0.9);
        const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
        this.unitTooltip.showFromBlueprint(bp, level, "player", pointer.x, pointer.y);
      });
      container.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!this.unitTooltip.visible) return;
        const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
        this.unitTooltip.showFromBlueprint(bp, level, "player", pointer.x, pointer.y);
      });
      container.on("pointerout", () => {
        if (this.selectedBenchIdx !== idx) bg.setFillStyle(fillColor, 0.9);
        this.unitTooltip.hide();
      });
    } else {
      // Battle mode: sprite only — hide everything else
      rect.setVisible(false);
      bg.setVisible(false);
      nameText.setVisible(false);
      hpText.setVisible(false);
      hpBarBg.setVisible(false);
      hpBarFg.setVisible(false);
    }

    return container;
  }

  private onBenchCardClick(idx: number): void {
    const state = GameState.get();

    // Empty bench slot: if a field unit is selected, move it here
    if (!state.benchUnits[idx]) {
      if (this.selectedFieldUnitId !== null) {
        this.moveFieldUnitToBench(this.selectedFieldUnitId, idx);
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
        this.buildBenchPanel();
      }
      return;
    }

    if (this.selectedFieldUnitId !== null) {
      const fieldUnit = [...state.units.values()].find(
        (u) => u.id === this.selectedFieldUnitId,
      );
      const bp = state.benchUnits[idx];
      if (fieldUnit && bp) {
        this.swapBenchWithField(bp, idx, fieldUnit);
      }
      this.selectedFieldUnitId = null;
      this.clearPlacementHighlights();
      this.buildBenchPanel();
      return;
    }
    if (this.selectedBenchIdx === idx) {
      this.selectedBenchIdx = null;
    } else {
      this.selectedBenchIdx = idx;
      this.selectedFieldUnitId = null;
      this.clearPlacementHighlights();
    }
    this.buildBenchPanel();
  }

  private buildStartBattleButton(): void {
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }

    const btnW = Math.round(160 * LAYOUT_SCALE);
    const btnH = Math.round(100 * LAYOUT_SCALE);
    const btnX = this.logX + this.logW / 2;
    const btnY = this.logY + this.logH / 2;

    const rect = this.add
      .rectangle(0, 0, btnW, btnH, 0x2a6a2a)
      .setStrokeStyle(Math.round(2 * LAYOUT_SCALE), 0x44aa44);
    const label = this.add
      .text(0, 0, "⚔\nBattle", {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);

    const btn = this.add.container(btnX, btnY, [rect, label]);
    btn.setSize(btnW, btnH);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => rect.setFillStyle(0x3a8a3a));
    btn.on("pointerout",  () => rect.setFillStyle(0x2a6a2a));
    btn.on("pointerup",   () => this.startBattle());

    this.startBattleBtn = btn;
  }

  private clearPlacementHighlights(): void {
    for (const [, cell] of this.cellViews) {
      cell.setHighlight("none");
    }
  }

  private highlightFieldUnit(unitId: string | null): void {
    this.clearPlacementHighlights();
    if (!unitId) return;
    const state = GameState.get();
    const unit = state.units.get(unitId);
    if (!unit) return;
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    for (const coord of cells) {
      this.cellViews.get(cellKey(coord))?.setHighlight("selected");
    }
  }

  // ─── Placement Input ───────────────────────────────────────────────────────

  private onPlacementCellClick(coord: CellCoord): void {
    if (coord.side !== "player") return;

    const state = GameState.get();
    const unitAtCell = state.occupancy.cellToUnit.get(cellKey(coord));

    if (this.selectedBenchIdx !== null) {
      const bp = state.benchUnits[this.selectedBenchIdx];
      if (!bp) return;

      if (!unitAtCell) {
        // Place on empty cell
        this.placeBenchUnitOnField(bp, this.selectedBenchIdx, coord);
      } else {
        // Swap: field unit goes to bench, bench unit takes its place
        this.swapBenchWithField(bp, this.selectedBenchIdx, unitAtCell);
      }
      this.selectedBenchIdx = null;
      this.buildBenchPanel();
      return;
    }

    // No bench unit selected
    if (unitAtCell) {
      if (this.selectedFieldUnitId === null) {
        // Select this field unit
        this.selectedFieldUnitId = unitAtCell.id;
        this.highlightFieldUnit(unitAtCell.id);
      } else if (this.selectedFieldUnitId === unitAtCell.id) {
        // Deselect
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      } else {
        // Swap two field units
        this.swapFieldUnits(this.selectedFieldUnitId, unitAtCell.id);
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      }
    } else {
      // Empty cell with a field unit selected → move it
      if (this.selectedFieldUnitId !== null) {
        this.moveFieldUnit(this.selectedFieldUnitId, coord);
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      }
    }
  }

  private placeBenchUnitOnField(
    bp: UnitBlueprint,
    benchIdx: number,
    anchor: CellCoord,
  ): void {
    let state = GameState.get();
    const newId = `p${++this.playerIdCounter}`;
    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const unit = createUnitInstance(bp, newId, anchor, level);

    if (!canPlace(anchor, bp.shape, state, "player")) return;

    state = placeUnit(unit, state);
    const newBench = [...state.benchUnits];
    newBench[benchIdx] = undefined;
    state = { ...state, benchUnits: newBench };
    GameState.set(state);

    this.createUnitView(unit);
  }

  private swapBenchWithField(
    bp: UnitBlueprint,
    benchIdx: number,
    fieldUnit: Unit,
  ): void {
    let state = GameState.get();
    const anchor = fieldUnit.anchor;

    // Remove field unit
    const newUnits = new Map(state.units);
    newUnits.delete(fieldUnit.id);
    state = { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) };

    // Check new unit fits
    if (!canPlace(anchor, bp.shape, state, "player")) {
      // Restore and abort
      state = GameState.get();
      return;
    }

    const newId = `p${++this.playerIdCounter}`;
    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const newUnit = createUnitInstance(bp, newId, anchor, level);
    state = placeUnit(newUnit, state);

    // Update bench: replace bp at benchIdx with field unit's blueprint
    const newBench = [...state.benchUnits];
    newBench[benchIdx] = blueprintFromUnit(fieldUnit);
    state = { ...state, benchUnits: newBench };
    GameState.set(state);

    this.destroyUnitView(fieldUnit.id);
    this.createUnitView(newUnit);
  }

  private swapFieldUnits(idA: string, idB: string): void {
    let state = GameState.get();
    const unitA = state.units.get(idA);
    const unitB = state.units.get(idB);
    if (!unitA || !unitB) return;

    const anchorA = unitA.anchor;
    const anchorB = unitB.anchor;

    // Remove both
    const tmpUnits = new Map(state.units);
    tmpUnits.delete(idA);
    tmpUnits.delete(idB);
    const tmpState = {
      ...state,
      units: tmpUnits,
      occupancy: buildOccupancy(tmpUnits),
    };

    if (!canPlace(anchorB, unitA.shape, tmpState, "player")) return;
    if (!canPlace(anchorA, unitB.shape, tmpState, "player")) return;

    state = placeUnit({ ...unitA, anchor: anchorB }, tmpState);
    state = placeUnit({ ...unitB, anchor: anchorA }, state);
    GameState.set(state);

    this.destroyUnitView(idA);
    this.destroyUnitView(idB);
    this.createUnitView({ ...unitA, anchor: anchorB });
    this.createUnitView({ ...unitB, anchor: anchorA });
  }

  private moveFieldUnit(unitId: string, newAnchor: CellCoord): void {
    let state = GameState.get();
    const unit = state.units.get(unitId);
    if (!unit) return;

    const tmpUnits = new Map(state.units);
    tmpUnits.delete(unitId);
    const tmpState = {
      ...state,
      units: tmpUnits,
      occupancy: buildOccupancy(tmpUnits),
    };

    if (!canPlace(newAnchor, unit.shape, tmpState, "player")) return;

    state = placeUnit({ ...unit, anchor: newAnchor }, tmpState);
    GameState.set(state);

    this.destroyUnitView(unitId);
    this.createUnitView({ ...unit, anchor: newAnchor });
  }

  private removeFieldUnit(coord: CellCoord): void {
    const state = GameState.get();
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) return;

    const newBench = [...state.benchUnits];
    const emptyIdx = newBench.findIndex((b) => b === undefined);
    if (emptyIdx === -1) return; // bench full — all 3 slots occupied
    const newUnits = new Map(state.units);
    newUnits.delete(unit.id);
    newBench[emptyIdx] = blueprintFromUnit(unit);
    const newState = {
      ...state,
      units: newUnits,
      occupancy: buildOccupancy(newUnits),
      benchUnits: newBench,
    };
    GameState.set(newState);

    this.destroyUnitView(unit.id);
    this.buildBenchPanel();
  }

  private moveFieldUnitToBench(unitId: string, benchIdx: number): void {
    const state = GameState.get();
    const unit = state.units.get(unitId);
    if (!unit) return;
    if (!state.benchUnits.some((b) => b === undefined)) return; // all slots occupied

    const newUnits = new Map(state.units);
    newUnits.delete(unit.id);

    const newBench = [...state.benchUnits];
    newBench[benchIdx] = blueprintFromUnit(unit);

    GameState.set({
      ...state,
      units: newUnits,
      occupancy: buildOccupancy(newUnits),
      benchUnits: newBench,
    });

    this.destroyUnitView(unit.id);
  }

  // ─── Double Click Detection ────────────────────────────────────────────────

  private handlePointerDown(coord: CellCoord): void {
    if (GameState.get().phase !== "placement") return;
    if (coord.side !== "player") return;

    const key = cellKey(coord);
    const now = Date.now();

    if (key === this.lastClickCoordKey && now - this.lastClickTime < 300) {
      // Double click — remove unit from field
      this.removeFieldUnit(coord);
      this.selectedFieldUnitId = null;
      this.selectedBenchIdx = null;
      this.clearPlacementHighlights();
      this.buildBenchPanel();
      this.lastClickCoordKey = null;
      this.lastClickTime = 0;
    } else {
      this.lastClickCoordKey = key;
      this.lastClickTime = now;
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    for (const [, cell] of this.cellViews) {
      cell.on("pointerdown", () => this.handlePointerDown(cell.coord));
      cell.on("pointerup", () => {
        if (GameState.get().phase === "placement") {
          this.onPlacementCellClick(cell.coord);
        } else {
          this.onCellClick(cell.coord);
        }
      });

      cell.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        const state = GameState.get();
        const unit = state.occupancy.cellToUnit.get(cell.key);
        if (unit && unit.hp > 0) {
          this.unitTooltip.show(unit, pointer.x, pointer.y);
        }
      });
      cell.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!this.unitTooltip.visible) return;
        const state = GameState.get();
        const unit = state.occupancy.cellToUnit.get(cell.key);
        if (unit && unit.hp > 0) {
          this.unitTooltip.show(unit, pointer.x, pointer.y);
        }
      });
      cell.on("pointerout", () => {
        this.unitTooltip.hide();
      });
    }
  }

  private onCellClick(coord: CellCoord): void {
    const state = GameState.get();
    if (state.phase !== "select_target") return;

    const isValid = state.validTargets.some(
      (c) => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const p = this.pendingTargetCoord;
    if (p && p.side === coord.side && p.row === coord.row && p.col === coord.col) {
      // Second click on the same cell → execute
      this.pendingTargetCoord = null;
      this.refreshCells(state);
      this.handleTargetSelect(coord, state);
    } else {
      // First click or switching target → show preview
      this.pendingTargetCoord = coord;
      this.showSkillPreview(state, coord);
    }
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    // Tear down placement UI; keep bench visible as display-only
    this.buildBenchPanel(false);
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }
    this.selectedBenchIdx = null;
    this.selectedFieldUnitId = null;
    this.clearPlacementHighlights();

    for (const [, cell] of this.cellViews) {
      cell.setMode('battle');
    }

    let state = GameState.get();

    // Save player unit positions so they can be restored next battle
    const placements: Record<string, CellCoord> = {};
    for (const unit of state.units.values()) {
      if (unit.anchor.side === 'player') {
        placements[unit.templateId] = unit.anchor;
      }
    }
    GameState.playerUnitPlacements = placements;
    GameState.playerBenchIds = state.benchUnits
      .filter((bp): bp is UnitBlueprint => bp !== undefined)
      .map(bp => bp.templateId);

    const queue = buildRoundQueue(state.units);
    state = { ...state, roundQueue: queue, phase: "select_target" };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED, state);
    this.setStatus("");
    this.battleLog.setVisible(true);
    this.chargedThisRound.clear();
    this.buildAutoBattleButtons();
    this.startActiveUnitTurn(state);
  }

  // ─── Turn Flow ─────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    this.pendingTargetCoord = null;
    if (GameState.get().phase === "end") return;
    if (GameState.getBattleMode() === "quick") return;
    const activeId = state.roundQueue[0];
    if (!activeId) return;

    const activeUnit = state.units.get(activeId);
    if (!activeUnit) {
      const next = this.advanceQueue(state);
      GameState.set(next);
      this.startActiveUnitTurn(next);
      return;
    }

    const mode = GameState.getBattleMode();
    this.updateManualButtons(state);

    if (activeUnit.anchor.side === "player") {
      // Auto / quick mode — player units act automatically
      if (mode === "auto") {
        this.setStatus(`${activeUnit.name} turn… (auto)`);
        const next: BattleState = {
          ...state,
          phase: "select_target",
          validTargets: [],
        };
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        return;
      }

      let validTargets: CellCoord[];
      if (activeUnit.skill.actionType === "mass_enchantment") {
        validTargets = getFriendlyTargets("player", state.occupancy);
      } else if (activeUnit.skill.actionType === "self_enchantment") {
        validTargets = getSelfTarget(activeUnit);
      } else if (activeUnit.skill.actionType === "ranged") {
        validTargets = getRangedTargets("player", state.occupancy);
      } else {
        validTargets = getMeleeTargets(activeUnit, state.occupancy);
      }

      // Back-row melee blocked by own front row — auto-skip
      if (validTargets.length === 0 && activeUnit.skill.actionType === "melee") {
        this.battleLog.addEntry(
          `${activeUnit.name} — blocked, skipping turn`,
          "neutral",
        );
        const next = this.advanceQueue(state);
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
          this.startActiveUnitTurn(next),
        );
        return;
      }

      const next: BattleState = {
        ...state,
        phase: "select_target",
        validTargets,
      };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.setStatus(
        (activeUnit.skill.actionType === "mass_enchantment" || activeUnit.skill.actionType === "self_enchantment")
          ? `${activeUnit.name} — Click on the green cell to heal`
          : `${activeUnit.name} — Click on the red cell to attack`,
      );
    } else {
      const next: BattleState = {
        ...state,
        phase: "select_target",
        validTargets: [],
      };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.setStatus(`${activeUnit.name} turn…`);
      this.time.delayedCall(
        mode === "auto" ? Game.DELAY_AUTO_THINK : Game.DELAY_ENEMY_THINK,
        () => this.autoTurn(),
      );
    }
  }

  private showSkillPreview(state: BattleState, coord: CellCoord): void {
    const activeUnit = state.units.get(state.roundQueue[0]);
    if (!activeUnit) return;

    this.refreshCells(state);

    const hitCells = getHitCells(activeUnit, coord);
    const isHeal =
      activeUnit.skill.actionType === "mass_enchantment" ||
      activeUnit.skill.actionType === "self_enchantment";

    for (const { coord: hc, multiplier } of hitCells) {
      this.cellViews.get(cellKey(hc))?.setSkillPreview(multiplier, isHeal);
    }

    const previewParts: string[] = [];
    const seen = new Set<string>();

    if (isHeal) {
      for (const { coord: hc } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        previewParts.push(`${unit.name} +${activeUnit.magicalDamage}`);
      }
    } else {
      const baseDamage = activeUnit.physicalDamage + activeUnit.magicalDamage;
      const damageType = activeUnit.skill?.damageBlock?.damageType ?? "physical";

      for (const { coord: hc, multiplier } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        const defense = damageType === "physical" ? unit.physicalDefense : unit.magicalDefense;
        const effectiveBase = Math.max(10, Math.round(baseDamage * (1 - defense / 100)));
        const dmg = Math.round(effectiveBase * multiplier);
        previewParts.push(`${unit.name} ~${dmg}`);
      }
    }

    let preview: string;
    if (previewParts.length === 0) {
      preview = "Preview: no targets in range";
    } else {
      preview = `Preview:\n${previewParts.join("\n")}\n[click again to confirm]`;
    }
    this.setStatus(preview);
  }

  private handleTargetSelect(coord: CellCoord, state: BattleState): void {
    const isValid = state.validTargets.some(
      (c) =>
        c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetUnit = state.occupancy.cellToUnit.get(cellKey(coord));

    if (
      activeUnit?.skill.actionType === "mass_enchantment" ||
      activeUnit?.skill.actionType === "self_enchantment"
    ) {
      const healerView = this.unitViews.get(state.roundQueue[0]);
      healerView?.setSpriteState("attack");
      this.time.delayedCall(400, () => {
        const current = GameState.get().units.get(state.roundQueue[0]);
        if (current && current.hp > 0) healerView?.setSpriteState("idle");
      });
      if (targetUnit) {
        const view = this.unitViews.get(targetUnit.id);
        if (view)
          this.showFloatingHeal(view.x, view.y, activeUnit?.magicalDamage ?? 0);
        this.battleLog.addEntry(
          `${activeUnit?.name ?? "?"} heals ${targetUnit.name} +${activeUnit?.magicalDamage ?? 0}`,
          "positive",
        );
      }
      let next = resolveHeal(
        activeUnit
          ? getHitCells(activeUnit, coord)
          : [{ coord, multiplier: 1.0 }],
        activeUnit?.magicalDamage ?? 0,
        state,
      );
      if (activeUnit?.skill.effectBlock) {
        const { state: effState, events: effEvents } = applyEffectBlock(activeUnit.skill.effectBlock, coord, next);
        next = effState;
        for (const e of effEvents) this.logEffectEvent(e);
      }
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
        this.startActiveUnitTurn(next),
      );
      return;
    }

    // Flash attack state briefly
    const attackerId = state.roundQueue[0];
    const attackerView = this.unitViews.get(attackerId);
    attackerView?.setSpriteState("attack");
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(attackerId);
      if (current && current.hp > 0) attackerView?.setSpriteState("idle");
    });

    const damageType = activeUnit?.skill.damageBlock?.damageType ?? "physical";
    let { state: next, events } = resolveAttack(
      activeUnit
        ? getHitCells(activeUnit, coord)
        : [{ coord, multiplier: 1.0 }],
      damageType === "physical"
        ? (activeUnit?.physicalDamage ?? 0)
        : (activeUnit?.magicalDamage ?? 0),
      damageType,
      state,
    );

    for (const event of events) {
      if (event.type === "dodged") {
        this.battleLog.addEntry(`${event.unitName} dodged the attack!`, "neutral");
      } else {
        const view = this.unitViews.get(event.unitId);
        if (view) this.showFloatingDamage(view.x, view.y, event.damage);
        if (event.type === "blocked") {
          this.battleLog.addEntry(
            `${activeUnit?.name ?? "?"} attacks ${event.unitName} — blocked! -${event.damage}`,
            "neutral",
          );
        } else {
          this.battleLog.addEntry(
            `${activeUnit?.name ?? "?"} attacks ${event.unitName} -${event.damage}`,
            "positive",
          );
        }
      }
    }

    if (activeUnit?.skill.effectBlock) {
      const { state: effState, events: effEvents } = applyEffectBlock(activeUnit.skill.effectBlock, coord, next);
      next = effState;
      for (const e of effEvents) this.logEffectEvent(e);
    }

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: "end" };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () =>
        this.showGameOver(winner),
      );
      return;
    }

    next = this.advanceQueue(next);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(next),
    );
  }

  private autoTurn(): void {
    const state = GameState.get();
    if (state.phase === "end") return;

    const unitId = state.roundQueue[0];
    const activeUnit = state.units.get(unitId);
    const isEnemy = activeUnit?.anchor.side === "enemy";

    // Guard applies only to player units in non-auto mode.
    // Enemy units always act automatically, regardless of battle mode.
    if (!isEnemy && GameState.getBattleMode() !== "auto") {
      if (GameState.getBattleMode() === "manual") {
        this.startActiveUnitTurn(state);
      }
      return;
    }
    if (!activeUnit) {
      const next = this.advanceQueue(state);
      GameState.set(next);
      this.startActiveUnitTurn(next);
      return;
    }

    const isPlayer = activeUnit.anchor.side === "player";
    const logStyle = isPlayer ? "positive" : "negative";
    const nextDelay = Game.DELAY_AUTO_NEXT;

    // ── Heal ────────────────────────────────────────────────────────────────
    if (
      activeUnit.skill.actionType === "mass_enchantment" ||
      activeUnit.skill.actionType === "self_enchantment"
    ) {
      const healerView = this.unitViews.get(unitId);
      healerView?.setSpriteState("attack");
      this.time.delayedCall(400, () => {
        const current = GameState.get().units.get(unitId);
        if (current && current.hp > 0) healerView?.setSpriteState("idle");
      });

      const healTargets =
        activeUnit.skill.actionType === "self_enchantment"
          ? getSelfTarget(activeUnit)
          : getFriendlyTargets(activeUnit.anchor.side, state.occupancy);
      if (healTargets.length === 0) {
        const next = this.advanceQueue(state);
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
        return;
      }

      const target = healTargets.reduce((best, coord) => {
        const u = state.occupancy.cellToUnit.get(cellKey(coord));
        const bestU = state.occupancy.cellToUnit.get(cellKey(best));
        return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp
          ? coord
          : best;
      });

      const healedUnit = state.occupancy.cellToUnit.get(cellKey(target));
      if (healedUnit) {
        const view = this.unitViews.get(healedUnit.id);
        if (view) this.showFloatingHeal(view.x, view.y, activeUnit.magicalDamage);
        this.battleLog.addEntry(
          `${activeUnit.name} heals ${healedUnit.name} +${activeUnit.magicalDamage}`,
          logStyle,
        );
      }

      let next = resolveHeal(
        getHitCells(activeUnit, target),
        activeUnit.magicalDamage,
        state,
      );
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
      return;
    }

    // ── Attack ───────────────────────────────────────────────────────────────
    const targets =
      activeUnit.skill.actionType === "ranged"
        ? getRangedTargets(activeUnit.anchor.side, state.occupancy)
        : getMeleeTargets(activeUnit, state.occupancy);

    if (targets.length === 0) {
      if (activeUnit.skill.actionType === "melee")
        this.battleLog.addEntry(
          `${activeUnit.name} — blocked, skipping turn`,
          "neutral",
        );
      const next = this.advanceQueue(state);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
      return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];

    const attackerView = this.unitViews.get(unitId);
    attackerView?.setSpriteState("attack");
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) attackerView?.setSpriteState("idle");
    });

    const autoAttackDmgType = activeUnit.skill.damageBlock?.damageType ?? "physical";
    let { state: next, events } = resolveAttack(
      getHitCells(activeUnit, target),
      autoAttackDmgType === "physical"
        ? activeUnit.physicalDamage
        : activeUnit.magicalDamage,
      autoAttackDmgType,
      state,
    );

    for (const event of events) {
      if (event.type === "dodged") {
        this.battleLog.addEntry(`${event.unitName} dodged the attack!`, "neutral");
      } else {
        const view = this.unitViews.get(event.unitId);
        if (view) this.showFloatingDamage(view.x, view.y, event.damage);
        if (event.type === "blocked") {
          this.battleLog.addEntry(
            `${activeUnit.name} attacks ${event.unitName} — blocked! -${event.damage}`,
            "neutral",
          );
        } else {
          this.battleLog.addEntry(
            `${activeUnit.name} attacks ${event.unitName} -${event.damage}`,
            logStyle,
          );
        }
      }
    }

    if (activeUnit.skill.effectBlock) {
      const { state: effState, events: effEvents } = applyEffectBlock(activeUnit.skill.effectBlock, target, next);
      next = effState;
      for (const e of effEvents) this.logEffectEvent(e);
    }

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: "end" };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => {
        this.destroyAutoBattleButtons();
        this.showGameOver(winner);
      });
      return;
    }

    next = this.advanceQueue(next);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
  }

  private runQuickBattle(): void {
    let state = GameState.get();
    const MAX_ITERATIONS = 2000;
    let i = 0;

    while (i++ < MAX_ITERATIONS) {
      const unitId = state.roundQueue[0];
      if (!unitId) break;

      state = computeOneTurn(state, unitId);
      state = this.advanceQueue(state);

      const winner = checkGameOver(state);
      if (winner) {
        state = { ...state, phase: "end" };
        break;
      }
    }

    state = { ...state, phase: "end" };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED, state);

    const winner = checkGameOver(state);
    this.time.delayedCall(200, () => this.showGameOver(winner ?? "player"));
  }

  private buildAutoBattleButtons(): void {
    const btnW = Math.round(44 * LAYOUT_SCALE);
    const btnH = Math.round(34 * LAYOUT_SCALE);
    const gap = Math.round(8 * LAYOUT_SCALE);
    const y = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const x1 = btnW / 2 + Math.round(12 * LAYOUT_SCALE);
    const x2 = x1 + btnW + gap;

    const makeBtn = (
      x: number,
      label: string,
      color: number,
      cb: () => void,
    ) => {
      const rect = this.add
        .rectangle(0, 0, btnW, btnH, color)
        .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), 0xaaaaaa);
      const txt = this.add
        .text(0, 0, label, {
          fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      const btn = this.add.container(x, y, [rect, txt]);
      btn.setSize(btnW, btnH).setInteractive({ useHandCursor: true });
      btn.setAlpha(0.4);
      btn.on("pointerover", () => { rect.setFillStyle(color + 0x111111); btn.setAlpha(0.85); });
      btn.on("pointerout", () => { rect.setFillStyle(color); btn.setAlpha(0.4); });
      btn.on("pointerup", cb);
      return btn;
    };

    const autoBtn = makeBtn(x1, "▶▶", 0x1a3a5a, () => {
      if (GameState.getBattleMode() === "auto") {
        GameState.setBattleMode("manual");
        this.updateManualButtons(GameState.get());
        return;
      }
      if (GameState.getBattleMode() !== "manual") return;
      GameState.setBattleMode("auto");
      this.updateManualButtons(GameState.get());
      const s = GameState.get();
      if (s.phase === "select_target") {
        const active = s.units.get(s.roundQueue[0]);
        if (active?.anchor.side === "player") {
          const next: BattleState = { ...s, validTargets: [] };
          GameState.set(next);
          EventBus.emit(Events.STATE_CHANGED, next);
          this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        }
      }
    });

    const quickBtn = makeBtn(x2, "⚡", 0x3a1a5a, () => {
      GameState.setBattleMode("quick");
      this.runQuickBattle();
    });

    this.autoBattleButtons = [autoBtn, quickBtn];
    this.buildManualTurnButtons();
  }

  private destroyAutoBattleButtons(): void {
    for (const btn of this.autoBattleButtons) btn.destroy();
    this.autoBattleButtons = [];
    for (const btn of this.manualTurnButtons) btn.destroy();
    this.manualTurnButtons = [];
    this.chargeBtn = null;
  }

  private advanceQueue(state: BattleState): BattleState {
    let remaining = state.roundQueue.slice(1);
    remaining = pruneQueue(remaining, state.units);
    if (remaining.length === 0) {
      this.chargedThisRound.clear();
      // Tick all buffs/debuffs simultaneously at round end
      const { state: ticked, events } = tickEffects(state);
      for (const e of events) this.logEffectEvent(e);
      state = ticked;
    }
    const queue =
      remaining.length > 0 ? remaining : buildRoundQueue(state.units);
    return { ...state, roundQueue: queue, validTargets: [] };
  }

  private logEffectEvent(e: EffectEvent): void {
    switch (e.type) {
      case 'effect_applied':
        this.battleLog.addEntry(`${e.unitName} is affected by ${e.effectName}`, 'neutral');
        break;
      case 'effect_tick_heal':
        this.battleLog.addEntry(`${e.unitName} regenerates +${e.amount} HP (${e.effectName})`, 'positive');
        break;
      case 'effect_tick_damage':
        this.battleLog.addEntry(`${e.unitName} takes -${e.amount} HP (${e.effectName})`, 'negative');
        break;
      case 'effect_expired':
        this.battleLog.addEntry(`${e.effectName} expired on ${e.unitName}`, 'neutral');
        break;
    }
  }

  private handleSkipTurn(): void {
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);
    if (!activeUnit) return;
    this.battleLog.addEntry(`${activeUnit.name} skips their turn`, "neutral");
    const next = this.advanceQueue(state);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.updateManualButtons(next);
    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(next),
    );
  }

  private handleChargeTurn(): void {
    const state = GameState.get();
    const activeId = state.roundQueue[0];
    const activeUnit = state.units.get(activeId);
    if (!activeUnit || this.chargedThisRound.has(activeId)) return;

    this.chargedThisRound.add(activeId);

    let remaining = state.roundQueue.slice(1);
    remaining = pruneQueue(remaining, state.units);

    let newQueue: string[];
    if (remaining.length === 0) {
      // Edge case: unit was already last in the round.
      // Move it to the end of the NEXT round's queue.
      newQueue = buildRoundQueue(state.units).filter((id) => id !== activeId);
      newQueue.push(activeId);
    } else {
      // Standard case: append the active unit at the end of remaining queue.
      newQueue = [...remaining, activeId];
    }

    this.battleLog.addEntry(
      `${activeUnit.name} charges their turn (acts last this round)`,
      "neutral",
    );
    const next: BattleState = {
      ...state,
      roundQueue: newQueue,
      validTargets: [],
    };
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.updateManualButtons(next);
    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(next),
    );
  }

  private updateManualButtons(state: BattleState): void {
    if (this.manualTurnButtons.length === 0) return;
    const mode = GameState.getBattleMode();
    const activeUnit = state.units.get(state.roundQueue[0]);
    const show = mode === "manual" && activeUnit?.anchor.side === "player";
    for (const btn of this.manualTurnButtons) btn.setVisible(show);
    if (show && this.chargeBtn) {
      const used = this.chargedThisRound.has(state.roundQueue[0]);
      this.chargeBtn.setAlpha(used ? 0.2 : 0.4);
      if (used) this.chargeBtn.disableInteractive();
      else this.chargeBtn.setInteractive({ useHandCursor: true });
    }
  }

  private buildManualTurnButtons(): void {
    const btnW = Math.round(44 * LAYOUT_SCALE);
    const btnH = Math.round(34 * LAYOUT_SCALE);
    const gap = Math.round(8 * LAYOUT_SCALE);
    const y = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const xSkip = this.scale.width - btnW / 2 - Math.round(12 * LAYOUT_SCALE);
    const xCharge = xSkip - btnW - gap;

    const makeBtn = (
      x: number,
      label: string,
      color: number,
      cb: () => void,
    ) => {
      const rect = this.add
        .rectangle(0, 0, btnW, btnH, color)
        .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), 0xaaaaaa);
      const txt = this.add
        .text(0, 0, label, {
          fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const btn = this.add.container(x, y, [rect, txt]);
      btn.setSize(btnW, btnH).setInteractive({ useHandCursor: true });
      btn.setAlpha(0.4);
      btn.on("pointerover", () => { rect.setFillStyle(color + 0x111111); btn.setAlpha(0.85); });
      btn.on("pointerout", () => { rect.setFillStyle(color); btn.setAlpha(0.4); });
      btn.on("pointerup", cb);
      return { btn, rect };
    };

    const { btn: skipBtn } = makeBtn(xSkip, "🛡️", 0x5a5a2a, () => {
      if (GameState.getBattleMode() !== "manual") return;
      this.handleSkipTurn();
    });

    const { btn: chargeBtn } = makeBtn(xCharge, "⏳", 0x2a5a3a, () => {
      if (GameState.getBattleMode() !== "manual") return;
      this.handleChargeTurn();
    });

    this.chargeBtn = chargeBtn;
    this.manualTurnButtons = [skipBtn, chargeBtn];

    for (const b of this.manualTurnButtons) b.setVisible(false);
  }

  // ─── State Refresh ─────────────────────────────────────────────────────────

  private onStateChanged(state: BattleState): void {
    this.refreshCells(state);
    this.refreshUnits(state);
    this.initiativeBar.update(state);
  }

  private refreshCells(state: BattleState): void {
    if (state.phase === "placement") return; // placement uses its own highlight logic

    const validKeys = new Set(state.validTargets.map(cellKey));
    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetHighlight =
      (activeUnit?.skill.actionType === "mass_enchantment" ||
        activeUnit?.skill.actionType === "self_enchantment")
        ? "heal_target"
        : "target";

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? targetHighlight : "none");
    }

    if (activeUnit) {
      const cells = getOccupiedCells(activeUnit.anchor, activeUnit.shape);
      for (const coord of cells) {
        this.cellViews.get(cellKey(coord))?.setHighlight("selected");
      }
    }
  }

  private refreshUnits(state: BattleState): void {
    for (const [id, view] of this.unitViews) {
      if (!view.active) continue;
      view.update(state.units.get(id) ?? null);
    }
  }

  // ─── Visual Effects ────────────────────────────────────────────────────────

  private showFloatingDamage(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y, `-${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }

  private showFloatingHeal(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y, `+${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: "#44dd44",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }

  private showGameOver(winner: Side): void {
    this.destroyAutoBattleButtons();
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72).setDepth(30);

    const isVictory = winner === "enemy";

    this.add
      .text(
        w / 2,
        h / 2 - Math.round(60 * LAYOUT_SCALE),
        isVictory ? "VICTORY!" : "DEFEAT",
        {
          fontSize: `${Math.round(52 * LAYOUT_SCALE)}px`,
          color: isVictory ? "#ffdd44" : "#ff4444",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: Math.round(5 * LAYOUT_SCALE),
        },
      )
      .setOrigin(0.5)
      .setDepth(31);

    const btnW = Math.round(180 * LAYOUT_SCALE);
    const btnH = Math.round(46 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(40 * LAYOUT_SCALE);
    const fontSize = `${Math.round(18 * LAYOUT_SCALE)}px`;

    if (isVictory) {
      // ── Level up all battle participants (field + bench), camp units excluded ──
      const allBlueprints = [
        ...PLAYER_UNITS,
        ...Object.values(ENEMY_UNITS).flat(),
      ];
      const state = GameState.get();

      // Field units — live Unit objects in state.units (camp units were never placed)
      state.units.forEach((unit) => {
        if (!unit.id.startsWith("p")) return;
        unit.level += 1;
        GameState.playerUnitLevels[unit.templateId] = unit.level;
        const bp = allBlueprints.find(b => b.templateId === unit.templateId);
        if (!bp) return;
        const scale = 1 + 0.1 * (unit.level - 1);
        unit.maxHp          = Math.round(bp.hp * scale);
        unit.physicalDamage = Math.round(bp.physicalDamage * scale);
        unit.magicalDamage  = Math.round(bp.magicalDamage  * scale);
      });
      GameState.set(state);

      // Bench units — stored as UnitBlueprint | undefined (camp units were never benched)
      state.benchUnits.forEach((bp) => {
        if (!bp) return;
        const currentLevel = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
        GameState.playerUnitLevels[bp.templateId] = currentLevel + 1;
      });

      // ── Two buttons ──
      const gap    = Math.round(20 * LAYOUT_SCALE);
      const leftX  = w / 2 - btnW / 2 - gap / 2;
      const rightX = w / 2 + btnW / 2 + gap / 2;

      // Restart Battle (same enemies, units already leveled up above)
      const restartBtn = this.add
        .rectangle(leftX, btnY, btnW, btnH, 0x4a4a6a)
        .setDepth(31)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(leftX, btnY, "Restart Battle", { fontSize, color: "#ffffff", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(32);
      restartBtn.on("pointerover", () => restartBtn.setFillStyle(0x6a6a8a));
      restartBtn.on("pointerout",  () => restartBtn.setFillStyle(0x4a4a6a));
      restartBtn.on("pointerup",   () => this.scene.restart({ replay: true }));

      // Exit Battle — return to prep screen
      const exitBtn = this.add
        .rectangle(rightX, btnY, btnW, btnH, 0x2a6a2a)
        .setDepth(31)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(rightX, btnY, "Exit Battle", { fontSize, color: "#ffffff", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(32);
      exitBtn.on("pointerover", () => exitBtn.setFillStyle(0x3a8a3a));
      exitBtn.on("pointerout",  () => exitBtn.setFillStyle(0x2a6a2a));
      exitBtn.on("pointerup",   () => this.scene.start("Prep"));
    } else {
      // Defeat — single Restart Battle button, no level-up
      const restartBtn = this.add
        .rectangle(w / 2, btnY, btnW, btnH, 0x2a4a7a)
        .setDepth(31)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(w / 2, btnY, "Restart Battle", { fontSize, color: "#ffffff", fontStyle: "bold" })
        .setOrigin(0.5)
        .setDepth(32);
      restartBtn.on("pointerover", () => restartBtn.setFillStyle(0x3a6aaa));
      restartBtn.on("pointerout",  () => restartBtn.setFillStyle(0x2a4a7a));
      restartBtn.on("pointerup",   () => this.scene.restart({ replay: true }));
    }
  }
}

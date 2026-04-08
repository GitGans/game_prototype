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
import { getMeleeTargets, getRangedTargets, getFriendlyTargets } from "../battle/targeting";
import { resolveAttack, resolveHeal, checkGameOver } from "../battle/combat";
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
  const pattern = attacker.skill?.pattern ?? PATTERNS.single;
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

  if (unit.actionType === 'heal') {
    const targets = getFriendlyTargets(side, state.occupancy);
    if (targets.length === 0) return state;
    const target = targets.reduce((best, coord) => {
      const u = state.occupancy.cellToUnit.get(cellKey(coord));
      const bestU = state.occupancy.cellToUnit.get(cellKey(best));
      return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp ? coord : best;
    });
    return resolveHeal(getHitCells(unit, target), unit.healAmount, state);
  }

  const targets = unit.actionType === 'ranged'
    ? getRangedTargets(side, state.occupancy)
    : getMeleeTargets(unit, state.occupancy);

  if (targets.length === 0) return state;

  const target = targets[Math.floor(Math.random() * targets.length)];
  return resolveAttack(getHitCells(unit, target), unit.damage, unit.skill?.damageType ?? 'physical', state);
}

export class Game extends Phaser.Scene {
  private cellViews: Map<string, CellView> = new Map();
  private unitViews: Map<string, UnitView> = new Map();
  private initiativeBar!: InitiativeBar;
  private statusText!: Phaser.GameObjects.Text;
  private battleLog!: BattleLog;

  // Delays (ms)
  private static readonly DELAY_ENEMY_THINK = 700;
  private static readonly DELAY_AUTO_THINK  = 200;
  private static readonly DELAY_NEXT_TURN   = 500;
  private static readonly DELAY_AUTO_NEXT   = 150;
  private static readonly DELAY_GAMEOVER    = 600;

  // Placement phase UI
  private benchCards: Phaser.GameObjects.Container[] = [];
  private startBattleBtn: Phaser.GameObjects.Container | null = null;
  private autoBattleButtons: Phaser.GameObjects.Container[] = [];
  private selectedBenchIdx: number | null = null;
  private selectedFieldUnitId: string | null = null;
  private lastClickCoordKey: string | null = null;
  private lastClickTime = 0;

  // Counter for generating unique unit IDs during placement
  private playerIdCounter = 0;

  constructor() {
    super("Game");
  }

  create(): void {
    GameState.reset();

    this.buildGrid();
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
    const gridY = (canvasH - totalGridH) / 2 + Math.round(40 * LAYOUT_SCALE);

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

    const topY =
      this.cellPixelPos("player", 0, 2).y -
      CELL_SIZE / 2 -
      Math.round(14 * LAYOUT_SCALE);
    const { x: pFrontX } = this.cellPixelPos("player", 0, 0);
    const { x: pBackX } = this.cellPixelPos("player", 1, 0);
    const { x: eFrontX } = this.cellPixelPos("enemy", 0, 0);
    const { x: eBackX } = this.cellPixelPos("enemy", 1, 0);
    const playerCenterX = (pFrontX + pBackX) / 2;
    const enemyCenterX = (eFrontX + eBackX) / 2;
    const sideY = topY - Math.round(18 * LAYOUT_SCALE);
    this.add
      .text(playerCenterX, sideY, "PLAYER", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: COLORS.label,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1);
    this.add
      .text(enemyCenterX, sideY, "ENEMY", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: COLORS.labelEnemy,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1);
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

    const { key: textureKey, config: spriteConfig } = this.getSpriteKeyAndConfig(unit);
    const view = new UnitView(this, cx, cy, unit, colSpan, rowSpan, textureKey, spriteConfig);
    this.unitViews.set(unit.id, view);
  }

  private destroyUnitView(unitId: string): void {
    const view = this.unitViews.get(unitId);
    if (view) {
      view.destroy();
      this.unitViews.delete(unitId);
    }
  }

  private getSpriteKeyAndConfig(unit: Unit): { key: string | undefined; config: SpriteSheetConfig | undefined } {
    const allBlueprints = [
      ...PLAYER_UNITS,
      ...Object.values(ENEMY_UNITS).flat(),
    ];
    const bp = allBlueprints.find(b => b.templateId === unit.templateId);
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

    this.statusText = this.add
      .text(
        this.scale.width / 2,
        this.scale.height - Math.round(20 * LAYOUT_SCALE),
        "",
        {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: COLORS.textLight,
          align: "center",
        },
      )
      .setOrigin(0.5);

    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const rightGridRightEdge =
      this.scale.width / 2 + SIDE_GAP / 2 + totalGridW;
    const logGap = Math.round(10 * LAYOUT_SCALE);
    const logX = rightGridRightEdge + logGap;
    const logY = this.cellPixelPos("enemy", 0, 2).y - CELL_SIZE / 2;
    const logW = this.scale.width - logX - logGap;
    const logH =
      this.cellPixelPos("enemy", 0, 0).y +
      CELL_SIZE / 2 -
      logY;
    this.battleLog = new BattleLog(this, logX, logY, logW, logH);
    this.battleLog.setVisible(false);
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

  private buildBenchPanel(): void {
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
      const card = this.makeBenchCard(bp, i, panelX, cardY, isSelected);
      this.benchCards.push(card);
    }
  }

  private makeBenchCard(
    bp: UnitBlueprint | null,
    idx: number,
    x: number,
    y: number,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const cardH = this.benchCardHeight();

    // Empty slot — dim placeholder, no interaction
    if (bp === null) {
      const rect = this.add
        .rectangle(0, 0, BENCH_PANEL_WIDTH, cardH, COLORS.benchEmpty, 0.5)
        .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), COLORS.benchBorder);
      const container = this.add.container(x, y, [rect]);
      container.setSize(BENCH_PANEL_WIDTH, cardH);
      container.setInteractive({ useHandCursor: true });
      container.on("pointerup", () => this.onBenchCardClick(idx));
      return container;
    }

    // Occupied slot
    const fillColor = selected ? COLORS.benchSelected : COLORS.bench;
    const rect = this.add
      .rectangle(0, 0, BENCH_PANEL_WIDTH, cardH, fillColor, 0.9)
      .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), COLORS.benchBorder);

    // Sprite (frame 0 = idle) — only when texture is loaded for this blueprint
    const spriteKey = `sprite-${bp.templateId}`;
    const spriteObj =
      bp.spriteSheet && this.textures.exists(spriteKey)
        ? this.add
            .image(0, 0, spriteKey)
            .setFrame(0)
            .setDisplaySize(BENCH_PANEL_WIDTH - 2, cardH - 2)
        : null;

    const nameStyle = {
      fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
      color: COLORS.label,
      fontStyle: "bold",
      align: "center",
      stroke: "#000000",
      strokeThickness: Math.round(3 * LAYOUT_SCALE),
      wordWrap: { width: BENCH_PANEL_WIDTH - 8 },
    };
    const nameText = this.add
      .text(0, -cardH / 2 + Math.round(10 * LAYOUT_SCALE), bp.name, nameStyle)
      .setOrigin(0.5, 0);

    const statsStyle = {
      fontSize: `${Math.round(10 * LAYOUT_SCALE)}px`,
      color: COLORS.textDark,
      align: "center",
      stroke: "#000000",
      strokeThickness: Math.round(2 * LAYOUT_SCALE),
    };
    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const scaledHp = Math.round(bp.hp * (1 + 0.1 * (level - 1)));
    const statsText = this.add
      .text(
        0,
        cardH / 2 - Math.round(10 * LAYOUT_SCALE),
        `HP:${scaledHp}  Init:${bp.initiative}`,
        statsStyle,
      )
      .setOrigin(0.5, 1);

    const children = spriteObj
      ? [rect, spriteObj, nameText, statsText]
      : [rect, nameText, statsText];
    const container = this.add.container(x, y, children);
    container.setSize(BENCH_PANEL_WIDTH, cardH);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerup", () => this.onBenchCardClick(idx));
    container.on("pointerover", () => {
      if (this.selectedBenchIdx !== idx) rect.setFillStyle(0x2a3a4a, 0.9);
    });
    container.on("pointerout", () => {
      if (this.selectedBenchIdx !== idx) rect.setFillStyle(fillColor, 0.9);
    });
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

    const btnW = Math.round(120 * LAYOUT_SCALE);
    const btnH = Math.round(36 * LAYOUT_SCALE);
    // Place below the initiative bar
    const btnY =
      Math.round(8 * LAYOUT_SCALE) +
      Math.round(28 * LAYOUT_SCALE) +
      btnH / 2 +
      Math.round(6 * LAYOUT_SCALE);
    const btnX = this.scale.width / 2;

    const rect = this.add
      .rectangle(0, 0, btnW, btnH, 0x2a6a2a)
      .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), 0x44aa44);
    const label = this.add
      .text(0, 0, "⚔  Battle", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const btn = this.add.container(btnX, btnY, [rect, label]);
    btn.setSize(btnW, btnH);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => rect.setFillStyle(0x3a8a3a));
    btn.on("pointerout", () => rect.setFillStyle(0x2a6a2a));
    btn.on("pointerup", () => this.startBattle());

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
    const emptyIdx = newBench.findIndex(b => b === undefined);
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
    if (!state.benchUnits.some(b => b === undefined)) return; // all slots occupied

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
    }
  }

  private onCellClick(coord: CellCoord): void {
    const state = GameState.get();
    if (state.phase !== "select_target") return;
    this.handleTargetSelect(coord, state);
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    // Tear down placement UI
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }
    this.selectedBenchIdx = null;
    this.selectedFieldUnitId = null;
    this.clearPlacementHighlights();

    let state = GameState.get();
    const queue = buildRoundQueue(state.units);
    state = { ...state, roundQueue: queue, phase: "select_target" };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED, state);
    this.setStatus("");
    this.battleLog.setVisible(true);
    this.buildAutoBattleButtons();
    this.startActiveUnitTurn(state);
  }

  // ─── Turn Flow ─────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    if (GameState.get().phase === 'end') return;
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

    if (activeUnit.anchor.side === "player") {
      // Auto / quick mode — player units act automatically
      if (mode === 'auto') {
        this.setStatus(`${activeUnit.name} turn… (auto)`);
        const next: BattleState = { ...state, phase: 'select_target', validTargets: [] };
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        return;
      }

      let validTargets: CellCoord[];
      if (activeUnit.actionType === "heal") {
        validTargets = getFriendlyTargets("player", state.occupancy);
      } else if (activeUnit.actionType === "ranged") {
        validTargets = getRangedTargets("player", state.occupancy);
      } else {
        validTargets = getMeleeTargets(activeUnit, state.occupancy);
      }

      // Back-row melee blocked by own front row — auto-skip
      if (validTargets.length === 0 && activeUnit.actionType === "melee") {
        this.battleLog.addEntry(`${activeUnit.name} — blocked, skipping turn`, "neutral");
        const next = this.advanceQueue(state);
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(Game.DELAY_NEXT_TURN, () => this.startActiveUnitTurn(next));
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
        activeUnit.actionType === "heal"
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
        mode === 'auto' ? Game.DELAY_AUTO_THINK : Game.DELAY_ENEMY_THINK,
        () => this.autoTurn(),
      );
    }
  }

  private handleTargetSelect(coord: CellCoord, state: BattleState): void {
    const isValid = state.validTargets.some(
      (c) =>
        c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetUnit = state.occupancy.cellToUnit.get(cellKey(coord));

    if (activeUnit?.actionType === "heal") {
      const healerView = this.unitViews.get(state.roundQueue[0]);
      healerView?.setSpriteState('attack');
      this.time.delayedCall(400, () => {
        const current = GameState.get().units.get(state.roundQueue[0]);
        if (current && current.hp > 0) healerView?.setSpriteState('idle');
      });
      if (targetUnit) {
        const view = this.unitViews.get(targetUnit.id);
        if (view) this.showFloatingHeal(view.x, view.y, activeUnit?.healAmount ?? 0);
        this.battleLog.addEntry(
          `${activeUnit?.name ?? "?"} heals ${targetUnit.name} +${activeUnit?.healAmount ?? 0}`,
          "positive",
        );
      }
      let next = resolveHeal(activeUnit ? getHitCells(activeUnit, coord) : [{ coord, multiplier: 1.0 }], activeUnit?.healAmount ?? 0, state);
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(Game.DELAY_NEXT_TURN, () => this.startActiveUnitTurn(next));
      return;
    }

    if (targetUnit) {
      const view = this.unitViews.get(targetUnit.id);
      if (view) this.showFloatingDamage(view.x, view.y, activeUnit?.damage ?? 0);
      this.battleLog.addEntry(
        `${activeUnit?.name ?? "?"} attacks ${targetUnit.name} -${activeUnit?.damage ?? 0}`,
        "positive",
      );
    }

    // Flash attack state briefly
    const attackerId = state.roundQueue[0];
    const attackerView = this.unitViews.get(attackerId);
    attackerView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(attackerId);
      if (current && current.hp > 0) attackerView?.setSpriteState('idle');
    });

    let next = resolveAttack(activeUnit ? getHitCells(activeUnit, coord) : [{ coord, multiplier: 1.0 }], activeUnit?.damage ?? 0, activeUnit?.skill?.damageType ?? 'physical', state);

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: "end" };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
      return;
    }

    next = this.advanceQueue(next);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.time.delayedCall(Game.DELAY_NEXT_TURN, () => this.startActiveUnitTurn(next));
  }

  private autoTurn(): void {
    const state = GameState.get();
    if (state.phase === 'end') return;

    const unitId = state.roundQueue[0];
    const activeUnit = state.units.get(unitId);
    if (!activeUnit) {
      const next = this.advanceQueue(state);
      GameState.set(next);
      this.startActiveUnitTurn(next);
      return;
    }

    const isPlayer = activeUnit.anchor.side === 'player';
    const logStyle = isPlayer ? 'positive' : 'negative';
    const nextDelay = Game.DELAY_AUTO_NEXT;

    // ── Heal ────────────────────────────────────────────────────────────────
    if (activeUnit.actionType === 'heal') {
      const healerView = this.unitViews.get(unitId);
      healerView?.setSpriteState('attack');
      this.time.delayedCall(400, () => {
        const current = GameState.get().units.get(unitId);
        if (current && current.hp > 0) healerView?.setSpriteState('idle');
      });

      const healTargets = getFriendlyTargets(activeUnit.anchor.side, state.occupancy);
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
        return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp ? coord : best;
      });

      const healedUnit = state.occupancy.cellToUnit.get(cellKey(target));
      if (healedUnit) {
        const view = this.unitViews.get(healedUnit.id);
        if (view) this.showFloatingHeal(view.x, view.y, activeUnit.healAmount);
        this.battleLog.addEntry(
          `${activeUnit.name} heals ${healedUnit.name} +${activeUnit.healAmount}`, logStyle,
        );
      }

      let next = resolveHeal(getHitCells(activeUnit, target), activeUnit.healAmount, state);
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
      return;
    }

    // ── Attack ───────────────────────────────────────────────────────────────
    const targets = activeUnit.actionType === 'ranged'
      ? getRangedTargets(activeUnit.anchor.side, state.occupancy)
      : getMeleeTargets(activeUnit, state.occupancy);

    if (targets.length === 0) {
      if (activeUnit.actionType === 'melee')
        this.battleLog.addEntry(`${activeUnit.name} — blocked, skipping turn`, 'neutral');
      const next = this.advanceQueue(state);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
      return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    const hitUnit = state.occupancy.cellToUnit.get(cellKey(target));
    if (hitUnit) {
      const view = this.unitViews.get(hitUnit.id);
      if (view) this.showFloatingDamage(view.x, view.y, activeUnit.damage);
      this.battleLog.addEntry(
        `${activeUnit.name} attacks ${hitUnit.name} -${activeUnit.damage}`, logStyle,
      );
    }

    const attackerView = this.unitViews.get(unitId);
    attackerView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) attackerView?.setSpriteState('idle');
    });

    let next = resolveAttack(getHitCells(activeUnit, target), activeUnit.damage, activeUnit.skill?.damageType ?? 'physical', state);

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: 'end' };
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
        state = { ...state, phase: 'end' };
        break;
      }
    }

    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED, state);

    const winner = checkGameOver(state);
    this.time.delayedCall(200, () => this.showGameOver(winner ?? 'player'));
  }

  private buildAutoBattleButtons(): void {
    const btnW = Math.round(110 * LAYOUT_SCALE);
    const btnH = Math.round(34 * LAYOUT_SCALE);
    const gap  = Math.round(8 * LAYOUT_SCALE);
    const y    = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const x1   = btnW / 2 + Math.round(12 * LAYOUT_SCALE);
    const x2   = x1 + btnW + gap;

    const makeBtn = (x: number, label: string, color: number, cb: () => void) => {
      const rect = this.add.rectangle(0, 0, btnW, btnH, color)
        .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), 0xaaaaaa);
      const txt = this.add.text(0, 0, label, {
        fontSize: `${Math.round(12 * LAYOUT_SCALE)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      const btn = this.add.container(x, y, [rect, txt]);
      btn.setSize(btnW, btnH).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => rect.setFillStyle(color + 0x111111));
      btn.on('pointerout',  () => rect.setFillStyle(color));
      btn.on('pointerup',   cb);
      return btn;
    };

    const autoBtn = makeBtn(x1, '▶▶ Auto Battle', 0x2a5a8a, () => {
      if (GameState.getBattleMode() !== 'manual') return;
      GameState.setBattleMode('auto');
      const s = GameState.get();
      if (s.phase === 'select_target') {
        const active = s.units.get(s.roundQueue[0]);
        if (active?.anchor.side === 'player') {
          const next: BattleState = { ...s, validTargets: [] };
          GameState.set(next);
          EventBus.emit(Events.STATE_CHANGED, next);
          this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        }
      }
    });

    const quickBtn = makeBtn(x2, '⚡ Quick Battle', 0x5a3a8a, () => {
      GameState.setBattleMode('quick');
      this.runQuickBattle();
    });

    this.autoBattleButtons = [autoBtn, quickBtn];
  }

  private destroyAutoBattleButtons(): void {
    for (const btn of this.autoBattleButtons) btn.destroy();
    this.autoBattleButtons = [];
  }

  private advanceQueue(state: BattleState): BattleState {
    let remaining = state.roundQueue.slice(1);
    remaining = pruneQueue(remaining, state.units);
    const queue =
      remaining.length > 0 ? remaining : buildRoundQueue(state.units);
    return { ...state, roundQueue: queue, validTargets: [] };
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
      activeUnit?.actionType === "heal" ? "heal_target" : "target";

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

    const isVictory = winner === 'enemy';

    this.add.text(
      w / 2,
      h / 2 - Math.round(60 * LAYOUT_SCALE),
      isVictory ? 'VICTORY!' : 'DEFEAT',
      {
        fontSize: `${Math.round(52 * LAYOUT_SCALE)}px`,
        color: isVictory ? '#ffdd44' : '#ff4444',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: Math.round(5 * LAYOUT_SCALE),
      },
    ).setOrigin(0.5).setDepth(31);

    const btnW = Math.round(180 * LAYOUT_SCALE);
    const btnH = Math.round(46 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(40 * LAYOUT_SCALE);
    const fontSize = `${Math.round(18 * LAYOUT_SCALE)}px`;

    if (isVictory) {
      const gap    = Math.round(20 * LAYOUT_SCALE);
      const leftX  = w / 2 - btnW / 2 - gap / 2;
      const rightX = w / 2 + btnW / 2 + gap / 2;

      // Replay button (left) — same enemies, no level-up
      const replayBtn = this.add.rectangle(leftX, btnY, btnW, btnH, 0x4a4a6a)
        .setDepth(31).setInteractive({ useHandCursor: true });
      this.add.text(leftX, btnY, 'Replay', { fontSize, color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(32);
      replayBtn.on('pointerover', () => replayBtn.setFillStyle(0x6a6a8a));
      replayBtn.on('pointerout',  () => replayBtn.setFillStyle(0x4a4a6a));
      replayBtn.on('pointerup',   () => this.scene.restart({ replay: true }));

      // Next Battle button (right) — level-up + new random enemies
      const nextBtn = this.add.rectangle(rightX, btnY, btnW, btnH, 0x2a6a2a)
        .setDepth(31).setInteractive({ useHandCursor: true });
      this.add.text(rightX, btnY, 'Next Battle', { fontSize, color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(32);
      nextBtn.on('pointerover', () => nextBtn.setFillStyle(0x3a8a3a));
      nextBtn.on('pointerout',  () => nextBtn.setFillStyle(0x2a6a2a));
      nextBtn.on('pointerup',   () => {
        const state = GameState.get();
        const allBlueprints = [...PLAYER_UNITS, ...Object.values(ENEMY_UNITS).flat()];
        state.units.forEach(unit => {
          if (!unit.id.startsWith('p')) return;
          unit.level += 1;
          GameState.playerUnitLevels[unit.templateId] = unit.level;
          const bp = allBlueprints.find(b => b.templateId === unit.templateId);
          if (!bp) return;
          const scale = 1 + 0.1 * (unit.level - 1);
          unit.maxHp      = Math.round(bp.hp * scale);
          unit.damage     = Math.round(bp.damage * scale);
          unit.healAmount = Math.round(bp.healAmount * scale);
        });
        GameState.set(state);
        this.scene.restart({ replay: false });
      });

    } else {
      // Defeat — single Replay button
      const replayBtn = this.add.rectangle(w / 2, btnY, btnW, btnH, 0x2a4a7a)
        .setDepth(31).setInteractive({ useHandCursor: true });
      this.add.text(w / 2, btnY, 'Replay', { fontSize, color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(32);
      replayBtn.on('pointerover', () => replayBtn.setFillStyle(0x3a6aaa));
      replayBtn.on('pointerout',  () => replayBtn.setFillStyle(0x2a4a7a));
      replayBtn.on('pointerup',   () => this.scene.restart({ replay: true }));
    }
  }
}

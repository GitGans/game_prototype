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
import { EffectTooltip } from "../objects/EffectTooltip";
import { TOOLTIP } from "../ui/theme";
import {
  BattleState,
  BenchUnitSnapshot,
  CellCoord,
  Col,
  ResolvedHitCell,
  Side,
  Skill,
  Unit,
  SpriteSheetConfig,
  UnitRace,
} from "../battle/types";
import { PhaseManager } from '../core/PhaseManager';
import { BattleParticipant } from '../core/phases';
import { Button } from '../ui/Button';
import { SkillTooltip } from '../objects/SkillTooltip';
import { SkillBar } from '../objects/SkillBar';
import { ENEMY_GROUPS } from '../data/enemyGroupDefinitions';
import { PLAYER_UNITS } from "../data/unitDefinitions";
import { getUnitSpriteTextureKey } from "../core/unitSpriteKey";
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
import { resolveAttack, resolveHeal, checkGameOver, applyEffectBlock, tickEffects, effectiveStats, EffectEvent, resolveInstantEffects, applyVampirism, computeDamageVsUnit } from "../battle/combat";
import { resolvePattern } from "../battle/skillPatterns";
import { LEVELED_EFFECTS, getSkillPattern, getEffectPattern, getInstantEffectPattern, DAMAGE_MATRICES, getDamageModifierPercent } from "../data/skillDefinitions";
import { buildRoundQueue, pruneQueue, rebuildRemainingQueue } from "../battle/initiative";
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  replayPlaceEnemies,
  createUnitInstance,
  benchSnapshotFromUnit,
} from "../battle/autoPlace";

/** Returns the currently active skill for a unit. */
function activeSkill(unit: Unit): Skill {
  return unit.skills[unit.activeSkillIndex] ?? unit.skills[0];
}

/**
 * Resolves the pattern of a unit's active skill relative to a target anchor cell.
 * Falls back to PATTERNS.single if the unit has no skill or damageBlock.
 * Used by all combat paths: manual, auto, quick.
 */
function getHitCells(attacker: Unit, anchor: CellCoord): ResolvedHitCell[] {
  const skill = activeSkill(attacker);
  const pattern = skill?.damageBlock ? getSkillPattern(skill) : DAMAGE_MATRICES.single.levels[0];
  return resolvePattern(anchor, pattern);
}

/**
 * Resolves the Effect object and computedPerTurn for a skill's effectBlock.
 * For stat-based effects (regeneration / lose_health): computedPerTurn = casterStat × matrix multiplier.
 * For defense-only effects (fortify / weaken / etc.): returns a copy of Effect with level-specific bonus.
 * Pass the returned values directly to applyEffectBlock.
 */
function resolveEffectArgs(skill: Skill, caster: Unit): [import('../battle/types').Effect, number | undefined] {
  const eb = skill.effectBlock!;
  const def = LEVELED_EFFECTS[eb.effectName];

  if (def.effectDamageType !== undefined) {
    // Stat-based per-turn: regeneration / lose_health
    const pattern = getEffectPattern(eb);
    const anchorCell = pattern.cells[pattern.anchorRow][pattern.anchorCol]!;
    const stat = def.effectDamageType === 'physical' ? caster.physicalDamage : caster.magicalDamage;
    const computedPerTurn = Math.round(stat * anchorCell.damageMultiplier);
    return [def.effect, computedPerTurn];
  }

  if (def.bonusByLevel !== undefined) {
    // Defense-only: fortify / weaken / arcane_shield / arcane_vulnerability
    const bonus = def.bonusByLevel[eb.level - 1] ?? def.bonusByLevel[0];
    const resolvedEffect: import('../battle/types').Effect = {
      ...def.effect,
      physicalDefenseBonus: def.effect.physicalDefenseBonus !== undefined
        ? Math.sign(def.effect.physicalDefenseBonus) * bonus
        : undefined,
      magicalDefenseBonus: def.effect.magicalDefenseBonus !== undefined
        ? Math.sign(def.effect.magicalDefenseBonus) * bonus
        : undefined,
      dodgeBonus: def.effect.dodgeBonus !== undefined
        ? Math.sign(def.effect.dodgeBonus) * bonus
        : undefined,
      blockBonus: def.effect.blockBonus !== undefined
        ? Math.sign(def.effect.blockBonus) * bonus
        : undefined,
      initiativeBonus: def.effect.initiativeBonus !== undefined
        ? Math.sign(def.effect.initiativeBonus) * bonus
        : undefined,
      physicalDamageBonus: def.effect.physicalDamageBonus !== undefined
        ? Math.sign(def.effect.physicalDamageBonus) * bonus
        : undefined,
      magicalDamageBonus: def.effect.magicalDamageBonus !== undefined
        ? Math.sign(def.effect.magicalDamageBonus) * bonus
        : undefined,
    };
    return [resolvedEffect, undefined];
  }

  return [def.effect, undefined];
}

/**
 * Compute one turn for the given unit and return the resulting BattleState.
 * Pure — no Phaser calls, no animations. Used by runQuickBattle().
 */
function computeOneTurn(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit) return state;

  const side = unit.anchor.side;
  // Pick a random skill for this turn (quick battle)
  unit.activeSkillIndex = Math.floor(Math.random() * unit.skills.length);
  const skill = activeSkill(unit);

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
      const [eff, perTurn] = resolveEffectArgs(skill, unit);
      next = applyEffectBlock(skill.effectBlock, getEffectPattern(skill.effectBlock), target, next, eff, perTurn).state;
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
  const casterStats = effectiveStats(unit);
  const baseDamage = damageType === "physical" ? casterStats.physicalDamage : casterStats.magicalDamage;

  let next = state;
  if (skill.damageBlock) {
    const attackResult = resolveAttack(getHitCells(unit, target), baseDamage, damageType, state, skill.damageModifierBlocks);
    next = attackResult.state;
    if (skill.postDamageBlock && attackResult.totalRealDamage > 0) {
      next = applyVampirism(skill.postDamageBlock, unit, attackResult.totalRealDamage, next).state;
    }
  }
  if (skill.effectBlock) {
    const [eff, perTurn] = resolveEffectArgs(skill, unit);
    next = applyEffectBlock(skill.effectBlock, getEffectPattern(skill.effectBlock), target, next, eff, perTurn).state;
  }
  return next;
}

export class Game extends Phaser.Scene {
  private cellViews: Map<string, CellView> = new Map();
  private unitViews: Map<string, UnitView> = new Map();
  private initiativeBar!: InitiativeBar;
  private statusText!: Phaser.GameObjects.Text;
  private statusBaseY!: number;
  private statusHeaderText!: Phaser.GameObjects.Text;
  private battleLog!: BattleLog;
  private unitTooltip!: UnitTooltip;
  private effectTooltip!: EffectTooltip;
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
  private startBattleBtn: Button | null = null;
  private autoBattleButtons: Button[] = [];
  private chargedThisRound = new Set<string>();
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;
  private selectedBenchIdx: number | null = null;
  private selectedFieldUnitId: string | null = null;
  private pendingTargetCoord: CellCoord | null = null;
  private lastClickCoordKey: string | null = null;
  private skillBar!: SkillBar;
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
    this.unitTooltip = new UnitTooltip(this, TOOLTIP.bg, TOOLTIP.bgAlpha);
    this.effectTooltip = new EffectTooltip(this);
    this.skillBar = new SkillBar(this, new SkillTooltip(this));
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
    let state = GameState.get();
    const phase = PhaseManager.getPhase();
    const isDebug = phase.type === 'battle' && phase.isDebug;

    if (isDebug) {
      state = autoPlacePlayer(state, PhaseManager.buildDebugBattleSetup());
    } else {
      GameState.reset();
      state = GameState.get();
      state = autoPlacePlayer(state);
    }

    const playerMaxLevel = [...state.units.values()]
      .filter(u => u.anchor.side === 'player' && u.hp > 0)
      .reduce((max, u) => Math.max(max, u.level), 1);
    let forceRace: UnitRace | undefined;
    let enemyLevel: number | undefined;
    if (phase.type === 'battle') {
      const group = ENEMY_GROUPS[phase.enemyGroupId];
      if (group) {
        forceRace = group.race;
        enemyLevel = group.levelOverride;
      }
    }

    const saved = isDebug ? null : GameState.lastEnemyPlacements;
    if (saved) {
      state = replayPlaceEnemies(state, saved);
    } else {
      state = autoPlaceEnemies(state, enemyLevel ?? playerMaxLevel, forceRace);
      if (!isDebug) {
        GameState.lastEnemyPlacements = [...state.units.values()]
          .filter(u => u.id.startsWith('e'))
          .map(u => ({ templateId: u.templateId, anchor: u.anchor, level: u.level }));
      }
    }

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
      this.effectTooltip,
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
    if (!unit.spriteSheet) return { key: undefined, config: undefined };
    return {
      key: getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet),
      config: unit.spriteSheet,
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
    this.battleLog = new BattleLog(this, this.logX, this.logY, this.logW);
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
    this.statusBaseY = this.statusText.y;

    this.statusHeaderText = this.add
      .text(
        this.logX + this.logW / 2,
        this.statusBaseY,
        "",
        {
          fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
          color: COLORS.textLight,
          align: "center",
          wordWrap: { width: this.logW },
        },
      )
      .setOrigin(0.5, 0)
      .setVisible(false);
  }

  private setStatus(msg: string): void {
    this.statusHeaderText?.setVisible(false);
    this.statusText.setY(this.statusBaseY);
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
    bp: BenchUnitSnapshot | null,
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

    // Sprite (frame 0 = idle) — only when texture is loaded for this snapshot
    const spriteObj =
      bp.spriteKey && this.textures.exists(bp.spriteKey)
        ? this.add.image(0, 0, bp.spriteKey).setFrame(0).setDisplaySize(BENCH_PANEL_WIDTH - 2, cardH - 2)
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
    const hp = bp.stats.maxHp.value;
    const barW = BENCH_PANEL_WIDTH - Math.round(12 * LAYOUT_SCALE);
    const barH = Math.round(6 * LAYOUT_SCALE);
    const barY = cardH / 2 - Math.round(10 * LAYOUT_SCALE);

    const hpText = this.add.text(
      0, barY - Math.round(14 * LAYOUT_SCALE),
      `${hp}/${hp}`,
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
      container.on("pointerover", () => {
        if (this.selectedBenchIdx !== idx) bg.setFillStyle(COLORS.benchHover, 0.9);
        this.unitTooltip.showBenchSnapshot(bp, this.logX, this.logY, this.logW);
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

    this.startBattleBtn = new Button({
      scene: this, x: btnX, y: btnY, w: btnW, h: btnH,
      label: "⚔\nBattle", style: "primary", fontKey: "xl",
      onClick: () => this.startBattle(),
    });
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
    snapshot: BenchUnitSnapshot,
    benchIdx: number,
    anchor: CellCoord,
  ): void {
    let state = GameState.get();
    const fullBp = PLAYER_UNITS.find(b => b.templateId === snapshot.templateId)!;
    const newId = `p${++this.playerIdCounter}`;
    const setup = PhaseManager.getActiveBattleSetup();
    const unitState = setup.playerUnits[snapshot.templateId];
    const level = unitState?.level ?? snapshot.level;
    const unit = createUnitInstance(fullBp, newId, anchor, level, {
      itemContainers: setup.itemContainers,
      itemInstances:  setup.itemInstances,
      unitState,
    });

    if (!canPlace(anchor, fullBp.shape, state, "player")) return;

    state = placeUnit(unit, state);
    const newBench = [...state.benchUnits];
    newBench[benchIdx] = undefined;
    state = { ...state, benchUnits: newBench };
    GameState.set(state);

    this.createUnitView(unit);
  }

  private swapBenchWithField(
    snapshot: BenchUnitSnapshot,
    benchIdx: number,
    fieldUnit: Unit,
  ): void {
    let state = GameState.get();
    const anchor = fieldUnit.anchor;
    const fullBp = PLAYER_UNITS.find(b => b.templateId === snapshot.templateId)!;

    // Remove field unit
    const newUnits = new Map(state.units);
    newUnits.delete(fieldUnit.id);
    state = { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) };

    // Check new unit fits
    if (!canPlace(anchor, fullBp.shape, state, "player")) {
      // Restore and abort
      state = GameState.get();
      return;
    }

    const newId = `p${++this.playerIdCounter}`;
    const setup = PhaseManager.getActiveBattleSetup();
    const unitState = setup.playerUnits[snapshot.templateId];
    const level = unitState?.level ?? snapshot.level;
    const newUnit = createUnitInstance(fullBp, newId, anchor, level, {
      itemContainers: setup.itemContainers,
      itemInstances:  setup.itemInstances,
      unitState,
    });
    state = placeUnit(newUnit, state);

    // Update bench: replace snapshot at benchIdx with field unit's snapshot
    const newBench = [...state.benchUnits];
    newBench[benchIdx] = benchSnapshotFromUnit(fieldUnit, setup);
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
    const setup = PhaseManager.getActiveBattleSetup();
    newBench[emptyIdx] = benchSnapshotFromUnit(unit, setup);
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
    const setup = PhaseManager.getActiveBattleSetup();
    newBench[benchIdx] = benchSnapshotFromUnit(unit, setup);

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

      cell.on("pointerover", () => {
        const state = GameState.get();
        const unit = state.occupancy.cellToUnit.get(cell.key);
        if (unit && unit.hp > 0) {
          this.unitTooltip.showFixed(unit, this.logX, this.logY, this.logW);
        }
      });
      cell.on("pointerout", () => {
        this.unitTooltip.hide();
      });
    }
  }

  private onCellClick(coord: CellCoord): void {
    this.unitTooltip.hide();
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
    for (const unit of state.units.values()) {
      if (unit.anchor.side !== 'player') continue;
      const us = GameState.playerUnits[unit.templateId];
      if (us) GameState.playerUnits[unit.templateId] = { ...us, lastPlacement: unit.anchor };
    }

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
    this.clearSkillIcons();
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

    // Reset to first skill at the start of each turn
    if (activeUnit.activeSkillIndex !== 0) {
      const updatedUnit = { ...activeUnit, activeSkillIndex: 0 };
      const updatedUnits = new Map(state.units);
      updatedUnits.set(activeId, updatedUnit);
      state = { ...state, units: updatedUnits };
      GameState.set(state);
    }
    const currentUnit = state.units.get(activeId)!;

    const mode = GameState.getBattleMode();
    this.updateManualButtons(state);

    if (currentUnit.anchor.side === "player") {
      // Auto / quick mode — player units act automatically
      if (mode === "auto") {
        this.setStatus(`${currentUnit.name} turn… (auto)`);
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
      if (activeSkill(currentUnit).actionType === "mass_enchantment") {
        validTargets = getFriendlyTargets("player", state.occupancy);
      } else if (activeSkill(currentUnit).actionType === "self_enchantment") {
        validTargets = getSelfTarget(currentUnit);
      } else if (activeSkill(currentUnit).actionType === "ranged") {
        validTargets = getRangedTargets("player", state.occupancy);
      } else {
        validTargets = getMeleeTargets(currentUnit, state.occupancy);
      }

      // Back-row melee blocked by own front row — auto-skip
      if (validTargets.length === 0 && activeSkill(currentUnit).actionType === "melee") {
        this.battleLog.addEntry(
          `${currentUnit.name} — blocked, skipping turn`,
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
        (activeSkill(currentUnit).actionType === "mass_enchantment" || activeSkill(currentUnit).actionType === "self_enchantment")
          ? `${currentUnit.name} — Click on the green cell to heal`
          : `${currentUnit.name} — Click on the red cell to attack`,
      );
      this.showSkillIcons(currentUnit);
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
      activeSkill(activeUnit).actionType === "mass_enchantment" ||
      activeSkill(activeUnit).actionType === "self_enchantment";

    for (const { coord: hc, multiplier } of hitCells) {
      this.cellViews.get(cellKey(hc))?.setSkillPreview(multiplier, isHeal);
    }

    if (activeSkill(activeUnit).effectBlock) {
      const effectCells = resolvePattern(coord, getEffectPattern(activeSkill(activeUnit).effectBlock!));
      const isEffectHeal =
        activeSkill(activeUnit).actionType === "mass_enchantment" ||
        activeSkill(activeUnit).actionType === "self_enchantment";
      for (const { coord: ec } of effectCells) {
        this.cellViews.get(cellKey(ec))?.setEffectPreview(isEffectHeal);
      }
    }

    const previewParts: string[] = [];
    const seen = new Set<string>();
    const skill = activeSkill(activeUnit);

    // ── Skill header ──────────────────────────────────────────────────────────

    // ── Skill damage / heal lines ─────────────────────────────────────────────
    if (isHeal) {
      for (const { coord: hc } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        previewParts.push(`${unit.name} +${effectiveStats(activeUnit).magicalDamage}`);
      }
    } else {
      const damageType = skill.damageBlock?.damageType ?? "physical";
      const attackerStats = effectiveStats(activeUnit);
      const baseDamage = damageType === "physical" ? attackerStats.physicalDamage : attackerStats.magicalDamage;

      const ignorePercent: Partial<Record<string, number>> = {};
      if (skill.damageModifierBlocks) {
        for (const block of skill.damageModifierBlocks) {
          ignorePercent[block.type] = getDamageModifierPercent(block);
        }
      }
      const defIgnoreKey = damageType === "physical" ? "ignore_physical_defense" : "ignore_magical_defense";
      const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

      for (const { coord: hc, multiplier } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        const dmg = computeDamageVsUnit(baseDamage, damageType, unit, multiplier, defIgnore);
        previewParts.push(`${unit.name} ~${dmg}`);
      }
    }

    // ── Effect block ──────────────────────────────────────────────────────────
    if (skill.effectBlock) {
      const eb = skill.effectBlock;
      const [resolvedEffect, computedPerTurn] = resolveEffectArgs(skill, activeUnit);
      const effectCellCoords = resolvePattern(coord, getEffectPattern(eb));

      // Effect header
      previewParts.push(`[${eb.effectDisplayName}]`);

      // Per-unit lines only for stat-based effects (damage or heal per round)
      if (computedPerTurn !== undefined) {
        const seenEffect = new Set<string>();
        const sign = resolvedEffect.isBuff ? "+" : "-";
        for (const { coord: ec } of effectCellCoords) {
          const unit = state.occupancy.cellToUnit.get(cellKey(ec));
          if (!unit || seenEffect.has(unit.id)) continue;
          seenEffect.add(unit.id);
          previewParts.push(`${unit.name} ${sign}${computedPerTurn} HP/round`);
        }
      }
      // Defense-only effects: no per-unit lines (no numeric HP value to show)
    }

    // ── Assemble status text ──────────────────────────────────────────────────
    const preview = `Preview:\n${previewParts.join("\n")}\n[click again to confirm]`;
    this.setStatus(preview);

    const headerColor = skill.damageBlock?.damageType === 'magical' ? COLORS.skillMagical
                      : skill.damageBlock?.damageType === 'physical' ? COLORS.skillPhysical
                      : COLORS.textLight;
    const lineH = Math.round(14 * LAYOUT_SCALE);
    this.statusHeaderText
      .setColor(headerColor)
      .setText(skill.name)
      .setY(this.statusBaseY)
      .setVisible(true);
    this.statusText.setY(this.statusBaseY + lineH);
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
      (activeUnit && activeSkill(activeUnit).actionType === "mass_enchantment") ||
      (activeUnit && activeSkill(activeUnit).actionType === "self_enchantment")
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
      if (activeUnit?.skills && activeSkill(activeUnit).effectBlock) {
        const skill = activeSkill(activeUnit);
        const [eff, perTurn] = resolveEffectArgs(skill, activeUnit);
        const { state: effState, events: effEvents } = applyEffectBlock(skill.effectBlock!, getEffectPattern(skill.effectBlock!), coord, next, eff, perTurn);
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

    const damageType = activeUnit ? activeSkill(activeUnit)?.damageBlock?.damageType ?? "physical" : "physical";
    const activeSkillRef = activeUnit ? activeSkill(activeUnit) : undefined;
    const attackResult2 = resolveAttack(
      activeUnit
        ? getHitCells(activeUnit, coord)
        : [{ coord, multiplier: 1.0 }],
      damageType === "physical"
        ? (activeUnit ? effectiveStats(activeUnit).physicalDamage : 0)
        : (activeUnit ? effectiveStats(activeUnit).magicalDamage : 0),
      damageType,
      state,
      activeSkillRef?.damageModifierBlocks,
    );
    let { state: next, events } = attackResult2;
    if (activeUnit && activeSkillRef?.postDamageBlock && attackResult2.totalRealDamage > 0) {
      const { state: afterVamp, events: vampEvents } = applyVampirism(activeSkillRef.postDamageBlock, activeUnit, attackResult2.totalRealDamage, next);
      next = afterVamp;
      events = [...events, ...vampEvents];
    }

    for (const event of events) {
      if (event.type === "vampirism_heal") {
        const view = this.unitViews.get(event.unitId);
        if (view) this.showFloatingHeal(view.x, view.y, event.amount);
        this.battleLog.addEntry(`${event.unitName} restored ${event.amount} HP (vampirism)`, "positive");
        continue;
      }
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

    if (activeUnit && activeSkill(activeUnit).effectBlock) {
      const skill = activeSkill(activeUnit);
      const [eff, perTurn] = resolveEffectArgs(skill, activeUnit);
      const { state: effState, events: effEvents } = applyEffectBlock(skill.effectBlock!, getEffectPattern(skill.effectBlock!), coord, next, eff, perTurn);
      next = effState;
      for (const e of effEvents) this.logEffectEvent(e);
      if ((eff?.initiativeBonus ?? 0) !== 0) {
        next = {
          ...next,
          roundQueue: rebuildRemainingQueue(
            next.roundQueue[0],
            next.roundQueue.slice(1),
            this.chargedThisRound,
            next.units
          )
        };
      }
    }

    if (activeUnit && activeSkill(activeUnit).instantEffectBlock) {
      next = this.applyInstantEffects(next, activeUnit.id, coord, activeSkill(activeUnit));
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
    let state = GameState.get();
    if (state.phase === "end") return;

    const unitId = state.roundQueue[0];
    let activeUnit = state.units.get(unitId);
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

    // Pick a random skill for this auto/enemy turn
    const randomSkillIdx = Math.floor(Math.random() * activeUnit.skills.length);
    const updatedUnit = { ...activeUnit, activeSkillIndex: randomSkillIdx };
    const updatedUnits = new Map(state.units);
    updatedUnits.set(unitId, updatedUnit);
    state = { ...state, units: updatedUnits };
    GameState.set(state);
    activeUnit = updatedUnit;

    const isPlayer = activeUnit.anchor.side === "player";
    const logStyle = isPlayer ? "positive" : "negative";
    const nextDelay = Game.DELAY_AUTO_NEXT;

    // ── Heal ────────────────────────────────────────────────────────────────
    if (
      activeSkill(activeUnit).actionType === "mass_enchantment" ||
      activeSkill(activeUnit).actionType === "self_enchantment"
    ) {
      const healerView = this.unitViews.get(unitId);
      healerView?.setSpriteState("attack");
      this.time.delayedCall(400, () => {
        const current = GameState.get().units.get(unitId);
        if (current && current.hp > 0) healerView?.setSpriteState("idle");
      });

      const healTargets =
        activeSkill(activeUnit).actionType === "self_enchantment"
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
      activeSkill(activeUnit).actionType === "ranged"
        ? getRangedTargets(activeUnit.anchor.side, state.occupancy)
        : getMeleeTargets(activeUnit, state.occupancy);

    if (targets.length === 0) {
      if (activeSkill(activeUnit).actionType === "melee")
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

    const autoAttackDmgType = activeSkill(activeUnit).damageBlock?.damageType ?? "physical";
    const activeUnitStats = effectiveStats(activeUnit);
    const autoSkill = activeSkill(activeUnit);
    const attackResult3 = resolveAttack(
      getHitCells(activeUnit, target),
      autoAttackDmgType === "physical"
        ? activeUnitStats.physicalDamage
        : activeUnitStats.magicalDamage,
      autoAttackDmgType,
      state,
      autoSkill?.damageModifierBlocks,
    );
    let { state: next, events } = attackResult3;
    if (autoSkill?.postDamageBlock && attackResult3.totalRealDamage > 0) {
      const { state: afterVamp, events: vampEvents } = applyVampirism(autoSkill.postDamageBlock, activeUnit, attackResult3.totalRealDamage, next);
      next = afterVamp;
      events = [...events, ...vampEvents];
    }

    for (const event of events) {
      if (event.type === "vampirism_heal") {
        const view = this.unitViews.get(event.unitId);
        if (view) this.showFloatingHeal(view.x, view.y, event.amount);
        this.battleLog.addEntry(`${event.unitName} restored ${event.amount} HP (vampirism)`, "positive");
        continue;
      }
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

    if (activeSkill(activeUnit).effectBlock) {
      const skill = activeSkill(activeUnit);
      const [eff, perTurn] = resolveEffectArgs(skill, activeUnit);
      const { state: effState, events: effEvents } = applyEffectBlock(skill.effectBlock!, getEffectPattern(skill.effectBlock!), target, next, eff, perTurn);
      next = effState;
      for (const e of effEvents) this.logEffectEvent(e);
      if ((eff?.initiativeBonus ?? 0) !== 0) {
        next = {
          ...next,
          roundQueue: rebuildRemainingQueue(
            next.roundQueue[0],
            next.roundQueue.slice(1),
            this.chargedThisRound,
            next.units
          )
        };
      }
    }

    if (activeSkill(activeUnit).instantEffectBlock) {
      next = this.applyInstantEffects(next, activeUnit.id, target, activeSkill(activeUnit));
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
    const gap  = Math.round(8  * LAYOUT_SCALE);
    const y    = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const x1   = btnW / 2 + Math.round(12 * LAYOUT_SCALE);
    const x2   = x1 + btnW + gap;

    const autoBtn = new Button({
      scene: this, x: x1, y, w: btnW, h: btnH,
      label: "▶▶", style: "navy", fontKey: "lg", idle: true,
      onClick: () => {
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
      },
    });

    const quickBtn = new Button({
      scene: this, x: x2, y, w: btnW, h: btnH,
      label: "⚡", style: "neutral", fontKey: "lg", idle: true,
      onClick: () => {
        GameState.setBattleMode("quick");
        this.runQuickBattle();
      },
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

  /**
   * Applies instant effects (provoke / distract) after a skill resolves.
   * Removes affected units' turns from roundQueue.
   * For provoked units, executes an immediate counter-attack using the unit's
   * first melee/ranged skill. Normal dodge/block/defense apply to the counter-attack.
   */
  private applyInstantEffects(
    state: BattleState,
    casterId: string,
    targetCoord: CellCoord,
    skill: Skill,
  ): BattleState {
    if (!skill.instantEffectBlock) return state;

    const block = skill.instantEffectBlock;
    const pattern = getInstantEffectPattern(block);
    const { events, provokedUnitIds, distractedUnitIds } = resolveInstantEffects(
      block, pattern, targetCoord, state, state.roundQueue,
    );

    // Log instant effect results
    for (const e of events) {
      if (e.type === 'instant_effect_applied') {
        this.battleLog.addEntry(`${e.unitName} is affected by ${e.displayName}!`, 'neutral');
      } else if (e.type === 'instant_effect_failed') {
        this.battleLog.addEntry(`${e.displayName} failed on ${e.unitName}`, 'neutral');
      }
    }

    let next = state;

    // ── Distracted units — remove from queue ─────────────────────────────
    for (const unitId of distractedUnitIds) {
      const unit = next.units.get(unitId);
      if (!unit) continue;
      next = { ...next, roundQueue: next.roundQueue.filter(id => id !== unitId) };
      this.battleLog.addEntry(`${unit.name} is distracted and skips its turn!`, 'neutral');
    }

    // ── Provoked units — remove from queue, then counter-attack ──────────
    for (const unitId of provokedUnitIds) {
      const provokedUnit = next.units.get(unitId);
      if (!provokedUnit) continue;

      // Remove provoked unit's turn from the queue first
      next = { ...next, roundQueue: next.roundQueue.filter(id => id !== unitId) };

      // Check if caster is still alive
      const caster = next.units.get(casterId);
      if (!caster || caster.hp <= 0) {
        this.battleLog.addEntry(
          `${provokedUnit.name} was provoked but the provoker is gone — skips turn`,
          'neutral',
        );
        continue;
      }

      // Find provoked unit's basic attack (first melee or ranged skill)
      const basicSkill = provokedUnit.skills.find(
        s => s.actionType === 'melee' || s.actionType === 'ranged',
      );
      if (!basicSkill || !basicSkill.damageBlock) {
        this.battleLog.addEntry(
          `${provokedUnit.name} was provoked but has no basic attack — skips turn`,
          'neutral',
        );
        continue;
      }

      // Determine valid targets for the basic skill from the provoked unit's position
      const validTargets =
        basicSkill.actionType === 'melee'
          ? getMeleeTargets(provokedUnit, next.occupancy)
          : getRangedTargets(provokedUnit.anchor.side, next.occupancy);

      // Check if caster's anchor is among valid targets
      const casterIsReachable = validTargets.some(
        c => c.side === caster.anchor.side && c.row === caster.anchor.row && c.col === caster.anchor.col,
      );

      if (!casterIsReachable) {
        this.battleLog.addEntry(
          `${provokedUnit.name} was provoked but can't reach ${caster.name} — skips turn`,
          'neutral',
        );
        continue;
      }

      this.battleLog.addEntry(
        `${provokedUnit.name} is provoked — counter-attacks ${caster.name}!`,
        'neutral',
      );

      // Execute counter-attack: resolve basic skill pattern centered on caster's anchor
      const counterPattern = getSkillPattern(basicSkill);
      const hitCells = resolvePattern(caster.anchor, counterPattern);
      const dmgType = basicSkill.damageBlock.damageType;
      const provokedStats = effectiveStats(provokedUnit);
      const baseDmg = dmgType === 'physical' ? provokedStats.physicalDamage : provokedStats.magicalDamage;

      const { state: afterCounter, events: counterEvents } = resolveAttack(
        hitCells, baseDmg, dmgType, next,
      );
      next = afterCounter;

      for (const event of counterEvents) {
        if (event.type === 'vampirism_heal') continue;
        if (event.type === 'dodged') {
          this.battleLog.addEntry(`${event.unitName} dodged the counter-attack!`, 'neutral');
        } else {
          const view = this.unitViews.get(event.unitId);
          if (view) this.showFloatingDamage(view.x, view.y, event.damage);
          if (event.type === 'blocked') {
            this.battleLog.addEntry(
              `${provokedUnit.name} counter-attacks ${event.unitName} — blocked! -${event.damage}`,
              'neutral',
            );
          } else {
            this.battleLog.addEntry(
              `${provokedUnit.name} counter-attacks ${event.unitName} -${event.damage}`,
              'neutral',
            );
          }
        }
      }
    }

    return next;
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
        this.battleLog.addEntry(`${e.unitName} is affected by ${e.effectDisplayName}`, 'neutral');
        break;
      case 'effect_tick_heal':
        this.battleLog.addEntry(`${e.unitName} regenerates +${e.amount} HP (${e.effectDisplayName})`, 'positive');
        break;
      case 'effect_tick_damage':
        this.battleLog.addEntry(`${e.unitName} takes -${e.amount} HP (${e.effectDisplayName})`, 'negative');
        break;
      case 'effect_expired':
        this.battleLog.addEntry(`${e.effectDisplayName} expired on ${e.unitName}`, 'neutral');
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
      this.chargeBtn.setDisabled(used);
      if (used) this.chargeBtn.setAlpha(0.2);
    }
  }

  private buildManualTurnButtons(): void {
    const btnW    = Math.round(44 * LAYOUT_SCALE);
    const btnH    = Math.round(34 * LAYOUT_SCALE);
    const gap     = Math.round(8  * LAYOUT_SCALE);
    const y       = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const xSkip   = this.scale.width - btnW / 2 - Math.round(12 * LAYOUT_SCALE);
    const xCharge = xSkip - btnW - gap;

    const skipBtn = new Button({
      scene: this, x: xSkip, y, w: btnW, h: btnH,
      label: "🛡️", style: "ghost", fontKey: "lg", idle: true,
      onClick: () => {
        if (GameState.getBattleMode() !== "manual") return;
        this.handleSkipTurn();
      },
    });

    const chargeBtn = new Button({
      scene: this, x: xCharge, y, w: btnW, h: btnH,
      label: "⏳", style: "primary", fontKey: "lg", idle: true,
      onClick: () => {
        if (GameState.getBattleMode() !== "manual") return;
        this.handleChargeTurn();
      },
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
      (activeUnit && (activeSkill(activeUnit).actionType === "mass_enchantment" ||
        activeSkill(activeUnit).actionType === "self_enchantment"))
        ? "heal_target"
        : "target";

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? targetHighlight : "none");
      cell.clearEffectPreview();
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

  // ─── Skill Icon UI ─────────────────────────────────────────────────────────

  private showSkillIcons(unit: Unit): void {
    if (unit.skills.length < 1) { this.skillBar.hide(); return; }

    // 6 icons × 20px + 5 gaps × 3px = 135px — fits within one CELL_SIZE (126*LAYOUT_SCALE).
    const iconSize = Math.round(20 * LAYOUT_SCALE);
    const iconGap  = Math.round(3  * LAYOUT_SCALE);

    const occupiedCells = getOccupiedCells(unit.anchor, unit.shape);
    const rightmostCol  = Math.max(...occupiedCells.map(c => c.col)) as Col;
    const topRow        = Math.min(...occupiedCells.map(c => c.row));
    const bottomRow     = Math.max(...occupiedCells.map(c => c.row));

    const rightCellPos = this.cellPixelPos(unit.anchor.side, topRow, rightmostCol);
    const iconX        = rightCellPos.x + CELL_SIZE / 2 + iconGap + iconSize / 2;

    const unitTopY    = this.cellPixelPos(unit.anchor.side, topRow,    rightmostCol).y - CELL_SIZE / 2;
    const unitBottomY = this.cellPixelPos(unit.anchor.side, bottomRow, rightmostCol).y + CELL_SIZE / 2;
    const unitCenterY = (unitTopY + unitBottomY) / 2;
    const totalH      = unit.skills.length * iconSize + (unit.skills.length - 1) * iconGap;
    const startY      = unitCenterY - totalH / 2 + iconSize / 2;

    this.skillBar.show(unit, iconX, startY, iconSize, iconGap, i => this.switchActiveSkill(i));
  }

  private clearSkillIcons(): void {
    this.skillBar.hide();
  }

  private switchActiveSkill(index: number): void {
    const state = GameState.get();
    const unitId = state.roundQueue[0];
    const activeUnit = state.units.get(unitId);
    if (!activeUnit || activeUnit.anchor.side !== 'player') return;

    const updatedUnit: Unit = { ...activeUnit, activeSkillIndex: index };
    const updatedUnits = new Map(state.units);
    updatedUnits.set(unitId, updatedUnit);

    const skill = updatedUnit.skills[index];
    let validTargets: CellCoord[];
    if (skill.actionType === 'mass_enchantment') {
      validTargets = getFriendlyTargets('player', state.occupancy);
    } else if (skill.actionType === 'self_enchantment') {
      validTargets = getSelfTarget(updatedUnit);
    } else if (skill.actionType === 'ranged') {
      validTargets = getRangedTargets('player', state.occupancy);
    } else {
      validTargets = getMeleeTargets(updatedUnit, state.occupancy);
    }

    const next: BattleState = { ...state, units: updatedUnits, validTargets };
    this.pendingTargetCoord = null;
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);

    this.setStatus(
      skill.actionType === 'mass_enchantment' || skill.actionType === 'self_enchantment'
        ? `${updatedUnit.name} — Click on the green cell to heal`
        : `${updatedUnit.name} — Click on the red cell to attack`,
    );

    this.showSkillIcons(updatedUnit);
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

    if (isVictory) {
      // ── Two buttons ──
      const gap    = Math.round(20 * LAYOUT_SCALE);
      const leftX  = w / 2 - btnW / 2 - gap / 2;
      const rightX = w / 2 + btnW / 2 + gap / 2;

      new Button({
        scene: this, x: leftX, y: btnY, w: btnW, h: btnH,
        label: "Restart Battle", style: "neutral",
        onClick: () => PhaseManager.transition({ type: 'replay' }),
      }).setDepth(31);

      new Button({
        scene: this, x: rightX, y: btnY, w: btnW, h: btnH,
        label: "Exit Battle", style: "primary",
        onClick: () => {
          const phase = PhaseManager.getPhase();
          if (phase.type !== 'battle') return;

          const aliveIds = new Set(
            [...GameState.get().units.values()]
              .filter(u => u.id.startsWith('p'))
              .map(u => u.templateId)
          );

          const participants: BattleParticipant[] = phase.participants.map(p => ({
            ...p,
            isAlive: p.wasOnBench || aliveIds.has(p.templateId),
          }));

          PhaseManager.transition({ type: 'exit_battle', participants });
        },
      }).setDepth(31);
    } else {
      // Defeat — Restart Battle + optional Exit Battle (debug mode)
      const phase = PhaseManager.getPhase();
      const isDebugBattle = phase.type === 'battle' && phase.returnPhase.type === 'main_menu';

      const gap    = Math.round(20 * LAYOUT_SCALE);
      const leftX  = isDebugBattle ? w / 2 - btnW / 2 - gap / 2 : w / 2;
      const rightX = w / 2 + btnW / 2 + gap / 2;

      new Button({
        scene: this, x: leftX, y: btnY, w: btnW, h: btnH,
        label: "Restart Battle", style: "navy",
        onClick: () => PhaseManager.transition({ type: 'replay' }),
      }).setDepth(31);

      if (isDebugBattle) {
        new Button({
          scene: this, x: rightX, y: btnY, w: btnW, h: btnH,
          label: "Exit Battle", style: "primary",
          onClick: () => PhaseManager.transition({ type: 'exit_battle', participants: [] }),
        }).setDepth(31);
      }
    }
  }
}

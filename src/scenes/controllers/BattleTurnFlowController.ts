import Phaser from "phaser";
import { PhaseManager } from "../../core/PhaseManager";
import type { PhaseAction, BattleActionBarEntry } from "../../core/phases";
import type { BattleActionFeedback, AutoTurnIntentionFeedback } from "../../core/battleActionFeedback";
import type { CellCoord, Col, Side } from "../../battle/types";
import type { FieldBattleUnitSnapshot } from "../../shared/battleSnapshots";
import { getOccupiedCells } from "../../battle/shapes";
import {
  mapDirectiveToPresentationInput,
  resolveManualTargetPromptKindForUnit,
} from "../../core/battleDirectiveProjection";
import { buildManualTargetStatusText } from "../../objects/battleDirectivePresentation";
import type { CellView } from "../../objects/CellView";
import type { UnitView } from "../../objects/UnitView";
import type { SkillBar } from "../../objects/SkillBar";
import type { BattlePresentationController } from "./BattlePresentationController";
import { CELL_SIZE, LAYOUT_SCALE } from "../../core/Constants";
import { Button } from "../../ui/Button";

type BattlePhase = Extract<import("../../core/phases").GamePhase, { type: "battle" }>;

type BattleTurnSceneAction = Extract<PhaseAction, {
  type:
    | "battle_start_turn"
    | "battle_select_skill"
    | "battle_use_skill"
    | "battle_use_item"
    | "battle_advance_turn"
    | "battle_skip_turn"
    | "battle_charge_turn"
    | "battle_quick_turn"
    | "battle_decide_auto_turn"
    | "battle_apply_auto_turn"
}>;

type BattleTurnFlowControllerDeps = {
  scene: Phaser.Scene;
  cellViews: Map<string, CellView>;
  unitViews: Map<string, UnitView>;
  skillBar: SkillBar;
  battlePresentation: BattlePresentationController;
  setStatus: (text: string) => void;
  refreshCells: (phase: BattlePhase) => void;
  showGameOver: (eliminatedSide: Side) => void;
  setBattleLogVisible: (visible: boolean) => void;
  cellPixelPos: (side: Side, row: number, col: number) => { x: number; y: number };
  attachStateChangedListener: () => void;
  detachStateChangedListener: () => void;
};

export class BattleTurnFlowController {
  // Delay constants (ms)
  private static readonly DELAY_ENEMY_THINK = 700;
  private static readonly DELAY_AUTO_THINK  = 200;
  private static readonly DELAY_NEXT_TURN   = 500;
  private static readonly DELAY_AUTO_NEXT   = 150;
  private static readonly DELAY_GAMEOVER    = 600;
  private static readonly DELAY_AUTO_IMPACT = 200;

  // Timer registry
  private timers = new Set<Phaser.Time.TimerEvent>();
  private destroyed = false;

  // Battle control buttons
  private autoBattleButtons: Button[] = [];
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;

  constructor(private readonly deps: BattleTurnFlowControllerDeps) {}

  // ─── Timer Helpers ────────────────────────────────────────────────────────

  private schedule(delay: number, callback: () => void): void {
    if (this.destroyed) return;
    const timer = this.deps.scene.time.delayedCall(delay, () => {
      this.timers.delete(timer);
      if (!this.destroyed) callback();
    });
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const t of this.timers) t.remove(false);
    this.timers.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.destroyControls();
    this.deps.skillBar.hide();
  }

  // ─── Battle Controls ──────────────────────────────────────────────────────

  private buildAutoBattleButtons(): void {
    const scene = this.deps.scene;
    const btnW = Math.round(44 * LAYOUT_SCALE);
    const btnH = Math.round(34 * LAYOUT_SCALE);
    const gap  = Math.round(8  * LAYOUT_SCALE);
    const y    = scene.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const x1   = btnW / 2 + Math.round(12 * LAYOUT_SCALE);
    const x2   = x1 + btnW + gap;

    const autoBtn = new Button({
      scene, x: x1, y, w: btnW, h: btnH,
      label: "▶▶", style: "navy", fontKey: "lg", idle: true,
      onClick: () => this.toggleAutoMode(),
    });

    const quickBtn = new Button({
      scene, x: x2, y, w: btnW, h: btnH,
      label: "⚡", style: "neutral", fontKey: "lg", idle: true,
      onClick: () => {
        PhaseManager.transition({ type: "battle_set_mode", mode: "quick" });
        this.runQuickBattle();
      },
    });

    this.autoBattleButtons = [autoBtn, quickBtn];
    this.buildManualTurnButtons();
  }

  private buildManualTurnButtons(): void {
    const scene   = this.deps.scene;
    const btnW    = Math.round(44 * LAYOUT_SCALE);
    const btnH    = Math.round(34 * LAYOUT_SCALE);
    const gap     = Math.round(8  * LAYOUT_SCALE);
    const y       = scene.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const xSkip   = scene.scale.width - btnW / 2 - Math.round(12 * LAYOUT_SCALE);
    const xCharge = xSkip - btnW - gap;

    const skipBtn = new Button({
      scene, x: xSkip, y, w: btnW, h: btnH,
      label: "🛡️", style: "ghost", fontKey: "lg", idle: true,
      onClick: () => {
        if (this.getBattlePhase()?.battleMode !== "manual") return;
        this.skipTurn();
      },
    });

    const chargeBtn = new Button({
      scene, x: xCharge, y, w: btnW, h: btnH,
      label: "⏳", style: "primary", fontKey: "lg", idle: true,
      onClick: () => {
        if (this.getBattlePhase()?.battleMode !== "manual") return;
        this.chargeTurn();
      },
    });

    this.chargeBtn = chargeBtn;
    this.manualTurnButtons = [skipBtn, chargeBtn];

    for (const b of this.manualTurnButtons) b.setVisible(false);
  }

  private updateManualButtons(): void {
    if (this.manualTurnButtons.length === 0) return;

    const phase = this.getBattlePhase();
    const show = phase?.manualTurnControlsVisible === true;

    for (const btn of this.manualTurnButtons) btn.setVisible(show);

    if (show && this.chargeBtn && phase) {
      this.chargeBtn.setDisabled(phase.manualChargeDisabled);
    }
  }

  private destroyControls(): void {
    for (const btn of this.autoBattleButtons) btn.destroy();
    this.autoBattleButtons = [];

    for (const btn of this.manualTurnButtons) btn.destroy();
    this.manualTurnButtons = [];

    this.chargeBtn = null;
  }

  // ─── Snapshot Helper ──────────────────────────────────────────────────────

  private getBattlePhase(): BattlePhase | null {
    const phase = PhaseManager.getPhase();
    return phase.type === "battle" ? phase : null;
  }

  // ─── Core Action Helper ───────────────────────────────────────────────────

  private runBattleAction(action: BattleTurnSceneAction): BattleActionFeedback | null {
    const result = PhaseManager.transition(action);
    return result.status === "applied" ? result.battleFeedback : null;
  }

  // ─── Attack Animation ─────────────────────────────────────────────────────

  private playAttackAnimation(unitId: string): void {
    const unitView = this.deps.unitViews.get(unitId);
    unitView?.setSpriteState("attack");
    this.schedule(400, () => {
      const current = this.getBattlePhase()?.unitsById.get(unitId);
      if (current && current.lifeState === 'alive') unitView?.setSpriteState("idle");
    });
  }

  // ─── Winner Handling ──────────────────────────────────────────────────────

  private handleBattleWinner(result: BattleActionFeedback | null): boolean {
    if (!result?.winner) return false;
    this.clearTimers();
    this.destroyControls();
    this.deps.skillBar.hide();
    this.schedule(BattleTurnFlowController.DELAY_GAMEOVER, () => {
      this.deps.showGameOver(result.winner!);
    });
    return true;
  }

  // ─── Combat Entry Point ───────────────────────────────────────────────────

  beginCombat(): void {
    if (this.destroyed) return;
    this.destroyControls();
    this.buildAutoBattleButtons();

    PhaseManager.transition({ type: "battle_begin_combat" });
    this.deps.setStatus("");
    this.deps.setBattleLogVisible(true);
    this.startActiveUnitTurn();
  }

  // ─── Turn Flow ────────────────────────────────────────────────────────────

  private startActiveUnitTurn(): void {
    if (this.destroyed) return;
    this.clearSkillIcons();

    // Capture the active unit BEFORE the action — used as a style hint for event presentation.
    // PhaseManager.transition() is synchronous and rebuilds the snapshot immediately,
    // so reading from the snapshot here gives the correct pre-action unit.
    const activeUnit = this.getBattlePhase()?.activeUnit ?? null;

    const result = this.runBattleAction({ type: "battle_start_turn" });
    if (!result) return;

    // 'none' means empty queue or battle already ended — nothing to commit
    if (!result.directive || result.directive.type === "none") return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons();

    switch (result.directive.type) {
      case "continue_immediately": {
        // Queue recovery: active unit was missing; battle_start_turn advanced queue.
        // Effect ticks may have killed units — check before recursing.
        if (this.handleBattleWinner(result)) return;
        this.startActiveUnitTurn();
        return;
      }

      case "schedule_next_turn": {
        // Melee unit was blocked; battle_start_turn advanced queue.
        if (this.handleBattleWinner(result)) return;
        this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
          this.startActiveUnitTurn(),
        );
        return;
      }

      case "schedule_auto_turn": {
        const unit = this.getBattlePhase()?.unitsById.get(result.directive.activeUnitId) ?? null;
        const unitName = unit?.name ?? null;
        this.deps.battlePresentation.applyDirectivePresentation(
          mapDirectiveToPresentationInput(result.directive, unitName),
        );

        const delay = result.directive.delayKind === "auto_player"
          ? BattleTurnFlowController.DELAY_AUTO_THINK
          : BattleTurnFlowController.DELAY_ENEMY_THINK;
        this.schedule(delay, () => this.autoTurn());
        return;
      }

      case "await_manual_target": {
        const phase = PhaseManager.getPhase();
        const activeUnit = phase.type === "battle" ? phase.activeUnit : null;
        const unitName = activeUnit?.name ?? null;
        const mapped = mapDirectiveToPresentationInput(result.directive, unitName);
        const presentation = this.deps.battlePresentation.applyDirectivePresentation(mapped);

        if (presentation.displaySkillBar && activeUnit) {
          this.showSkillIcons(activeUnit);
        }
        return;
      }
    }
  }

  // ─── Cell Click (Manual Targeting) ───────────────────────────────────────

  handleCellClick(coord: CellCoord, phase: BattlePhase): void {
    if (this.destroyed) return;
    if (phase.battlePhase !== "select_target") return;
    if (!phase.activeUnitId) return;

    const isValid = phase.validTargets.some(
      c => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const prev = phase.previewTargetCoord;
    const isSameTarget =
      prev !== null && prev.side === coord.side && prev.row === coord.row && prev.col === coord.col;

    if (isSameTarget) {
      // Second click confirms. battle_use_skill clears the preview target centrally,
      // and onStateChanged → refreshCells repaints the cells.
      this.handleTargetSelect(coord, phase);
      return;
    }

    // First click (or retarget): store the preview target in battle state, then re-apply the
    // imperative overlay — the transition emitted STATE_CHANGED, and refreshCells blanked it.
    PhaseManager.transition({ type: "battle_preview_target", target: coord });
    const nextPhase = PhaseManager.getPhase();
    if (nextPhase.type === "battle") {
      this.deps.battlePresentation.applySkillPreview(nextPhase, coord);
    }
  }

  private handleTargetSelect(coord: CellCoord, phase: BattlePhase): void {
    if (this.destroyed) return;
    const attackerId = phase.activeUnitId!;
    const activeUnit = phase.activeUnit;

    this.playAttackAnimation(attackerId);

    // battle_use_skill composes: executeSkillUse → checkGameOver → advanceTurn → checkGameOver
    const result = this.runBattleAction({
      type: "battle_use_skill",
      unitId: attackerId,
      target: coord,
    });
    if (!result) return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);

    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(),
    );
  }

  // ─── Auto Turn ────────────────────────────────────────────────────────────

  private autoTurn(): void {
    if (this.destroyed) return;
    // Core decides what the auto unit will do — no state mutation.
    const decided = this.runBattleAction({ type: "battle_decide_auto_turn" });
    if (!decided) return;

    const directive = decided.autoTurnDirective;

    if (!directive || directive.type === "none") return;

    if (directive.type === "handoff_manual" || directive.type === "restart_turn") {
      this.startActiveUnitTurn();
      return;
    }

    // directive.type === 'intention'
    const { intention, animateAttack } = directive;

    if (animateAttack) {
      // Animation starts; apply fires after the impact delay.
      this.playAttackAnimation(intention.unitId);
      this.schedule(BattleTurnFlowController.DELAY_AUTO_IMPACT, () =>
        this.applyAutoTurnAndPresent(intention),
      );
    } else {
      // Skip and advance have no animation — apply immediately.
      this.applyAutoTurnAndPresent(intention);
    }
  }

  private applyAutoTurnAndPresent(intention: AutoTurnIntentionFeedback): void {
    if (this.destroyed) return;
    const applied = this.runBattleAction({ type: "battle_apply_auto_turn" });
    if (!applied) return;

    // Stale-intention guard: if mode changed or battle ended during DELAY_AUTO_IMPACT,
    // core returns autoTurnApplied: false — do not schedule another turn.
    if (!applied.autoTurnApplied) return;

    this.deps.battlePresentation.presentBattleEvents(applied.events, intention.activeUnitSide);

    if (this.handleBattleWinner(applied)) return;

    this.schedule(BattleTurnFlowController.DELAY_AUTO_NEXT, () =>
      this.startActiveUnitTurn(),
    );
  }

  // ─── Quick Battle ─────────────────────────────────────────────────────────

  runQuickBattle(): void {
    if (this.destroyed) return;
    this.clearTimers(); // cancel any pending turn callbacks before silent simulation
    // Reset turn context so charge-tracking from a prior manual turn does not leak in.
    // Emits one STATE_CHANGED before the scene goes silent — that is acceptable.
    PhaseManager.transition({ type: "battle_prepare_quick_battle" });

    // Detach the scene's listener so the quick simulation produces no mid-loop redraws.
    // EventBus context identity must be the scene; kept in deps callbacks for that reason.
    this.deps.detachStateChangedListener();

    const MAX_ITERATIONS = 2000;
    let i = 0;
    let finalWinner: Side | null = null;

    try {
      while (i++ < MAX_ITERATIONS) {
        const phase = this.getBattlePhase();
        const unitId = phase?.activeUnitId;
        if (!unitId) break;

        const result = this.runBattleAction({ type: "battle_quick_turn", unitId });
        if (!result) break;

        if (result.winner) {
          finalWinner = result.winner;
          break;
        }
      }
    } finally {
      // Always reattach — even if an error occurs — so the scene stays live.
      this.deps.attachStateChangedListener();
    }

    PhaseManager.transition({ type: "battle_mark_quick_battle_complete" });

    this.destroyControls();

    // Existing fallback: if MAX_ITERATIONS hit without a winner, declare player victory.
    this.schedule(200, () => {
      this.deps.showGameOver(finalWinner ?? "player");
    });
  }

  // ─── Skip / Charge ────────────────────────────────────────────────────────

  skipTurn(): void {
    if (this.destroyed) return;
    // Pre-action active unit: used only as style hint for presentBattleEvents.
    const activeUnit = this.getBattlePhase()?.activeUnit ?? null;

    const result = this.runBattleAction({ type: "battle_skip_turn", reason: "manual_skip" });
    if (!result) return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons();

    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(),
    );
  }

  chargeTurn(): void {
    if (this.destroyed) return;
    // Pre-action active unit: used only as style hint for presentBattleEvents.
    const activeUnit = this.getBattlePhase()?.activeUnit ?? null;

    const result = this.runBattleAction({ type: "battle_charge_turn" });
    if (!result) return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons();

    // Charge does not deal damage, but withWinner() wraps defensively — respect it.
    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(),
    );
  }

  // ─── Auto-Mode Toggle ─────────────────────────────────────────────────────

  toggleAutoMode(): void {
    if (this.destroyed) return;

    const phase = this.getBattlePhase();
    if (!phase) return;

    if (phase.battleMode === "auto") {
      PhaseManager.transition({ type: "battle_set_mode", mode: "manual" });
      this.updateManualButtons();
      return;
    }

    if (phase.battleMode !== "manual") return;

    PhaseManager.transition({ type: "battle_set_mode", mode: "auto" });
    this.updateManualButtons();

    // Read snapshot AFTER the mode transition.
    // battle_set_mode only changes battleMode — it does not advance the queue
    // or change the active unit, so activeUnitSide is still valid here.
    const nextPhase = this.getBattlePhase();
    if (
      nextPhase?.battlePhase === "select_target" &&
      nextPhase.activeUnitSide === "player" &&
      nextPhase.activeUnit
    ) {
      const active = nextPhase.activeUnit;
      // battle_start_turn resets validTargets and recomputes directive.
      // Must consume events and winner: start_turn may advance internally.
      const result = this.runBattleAction({ type: "battle_start_turn" });
      if (!result) return;
      this.deps.battlePresentation.presentBattleEvents(result.events, active);
      if (this.handleBattleWinner(result)) return;
      if (result.directive?.type === "schedule_auto_turn") {
        this.schedule(BattleTurnFlowController.DELAY_AUTO_THINK, () => this.autoTurn());
      }
    }
  }

  // ─── Skill Bar ────────────────────────────────────────────────────────────

  private showSkillIcons(unit: FieldBattleUnitSnapshot): void {
    // Layout is derived from the DISPLAYED action count, which includes the item entry when the
    // committed snapshot offers one — never from `unit.skills.length`.
    const phase = PhaseManager.getPhase();
    const actions = phase.type === 'battle' ? phase.activeUnitActions : [];
    if (actions.length < 1) { this.deps.skillBar.hide(); return; }

    const iconSize = Math.round(20 * LAYOUT_SCALE);
    const iconGap  = Math.round(3  * LAYOUT_SCALE);

    const occupiedCells = getOccupiedCells(unit.deployment.anchor, unit.shape);
    const rightmostCol  = Math.max(...occupiedCells.map(c => c.col)) as Col;
    const topRow        = Math.min(...occupiedCells.map(c => c.row));
    const bottomRow     = Math.max(...occupiedCells.map(c => c.row));

    const rightCellPos = this.deps.cellPixelPos(unit.deployment.anchor.side, topRow, rightmostCol);
    const iconX        = rightCellPos.x + CELL_SIZE / 2 + iconGap + iconSize / 2;

    const unitTopY    = this.deps.cellPixelPos(unit.deployment.anchor.side, topRow,    rightmostCol).y - CELL_SIZE / 2;
    const unitBottomY = this.deps.cellPixelPos(unit.deployment.anchor.side, bottomRow, rightmostCol).y + CELL_SIZE / 2;
    const unitCenterY = (unitTopY + unitBottomY) / 2;
    const totalH      = actions.length * iconSize + (actions.length - 1) * iconGap;
    const startY      = unitCenterY - totalH / 2 + iconSize / 2;

    this.deps.skillBar.show(
      actions, unit.activeSkillIndex, iconX, startY, iconSize, iconGap,
      entry => this.selectBarAction(entry),
    );
  }

  /**
   * A skill switches the active skill and re-prompts for a target. An item is dispatched
   * IMMEDIATELY: no skill selection, no target preview, no target confirmation, no attack
   * animation — it resolves against its owner and ends the turn.
   */
  private selectBarAction(entry: BattleActionBarEntry): void {
    if (entry.kind === 'skill') { this.switchActiveSkill(entry.skillIndex); return; }
    this.useEquippedItem(entry.unitId, entry.instanceId);
  }

  private useEquippedItem(unitId: string, instanceId: string): void {
    // Pre-action active unit: used only as a style hint for presentBattleEvents.
    const phase = PhaseManager.getPhase();
    const activeUnit = phase.type === 'battle' ? phase.activeUnit : null;

    const result = this.runBattleAction({ type: 'battle_use_item', unitId, instanceId });
    // A rejected or refused activation changes nothing and must not schedule a turn.
    if (!result?.itemUse?.applied) return;

    // The bar is rebuilt from the committed snapshot at the next turn start; clearing it here
    // makes the consumed action disappear immediately rather than one frame late.
    this.clearSkillIcons();
    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);

    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(),
    );
  }

  private clearSkillIcons(): void {
    this.deps.skillBar.hide();
  }

  private switchActiveSkill(index: number): void {
    const result = this.runBattleAction({ type: "battle_select_skill", skillIndex: index });
    if (!result) return;

    // battle_select_skill clears the preview target centrally in PhaseManager.

    const phase = PhaseManager.getPhase();
    const activeUnit = phase.type === "battle" ? phase.activeUnit : null;
    if (!activeUnit) return;

    const promptKind = resolveManualTargetPromptKindForUnit(activeUnit);
    if (!promptKind) return;
    const status = buildManualTargetStatusText(promptKind, activeUnit.name);

    this.deps.setStatus(status);
    this.showSkillIcons(activeUnit);
  }
}

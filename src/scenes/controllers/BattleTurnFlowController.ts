import Phaser from "phaser";
import { GameState } from "../../core/GameState";
import { PhaseManager } from "../../core/PhaseManager";
import type { PhaseAction } from "../../core/phases";
import type { BattlePhaseActionResult, AutoTurnIntention } from "../../core/phaseHandlers/battlePhaseHandler";
import type { BattleState, CellCoord, Col, Side } from "../../battle/types";
import type { BattleUnitSnapshot } from "../../shared/battleSnapshots";
import { getOccupiedCells } from "../../battle/shapes";
import { getActiveSkill, isEnchantmentSkill } from "../../battle/skillRuntime";
import { buildManualTargetStatusText } from "../../objects/battleDirectivePresentation";
import type { CellView } from "../../objects/CellView";
import type { UnitView } from "../../objects/UnitView";
import type { SkillBar } from "../../objects/SkillBar";
import type { BattlePresentationController } from "./BattlePresentationController";
import { CELL_SIZE, LAYOUT_SCALE } from "../../core/Constants";

type BattlePhase = Extract<import("../../core/phases").GamePhase, { type: "battle" }>;

type BattleTurnSceneAction = Extract<PhaseAction, {
  type:
    | "battle_start_turn"
    | "battle_select_skill"
    | "battle_use_skill"
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
  updateManualButtons: (state: BattleState) => void;
  attachStateChangedListener: () => void;
  detachStateChangedListener: () => void;
};

export class BattleTurnFlowController {
  // Delay constants (ms) — moved from Game.ts
  private static readonly DELAY_ENEMY_THINK = 700;
  private static readonly DELAY_AUTO_THINK  = 200;
  private static readonly DELAY_NEXT_TURN   = 500;
  private static readonly DELAY_AUTO_NEXT   = 150;
  private static readonly DELAY_GAMEOVER    = 600;
  private static readonly DELAY_AUTO_IMPACT = 200;

  // Timer registry
  private timers = new Set<Phaser.Time.TimerEvent>();
  private destroyed = false;

  // Manual-target confirmation state
  private pendingTargetCoord: CellCoord | null = null;

  constructor(private readonly deps: BattleTurnFlowControllerDeps) {}

  // ─── Timer Helpers ────────────────────────────────────────────────────────

  private schedule(delay: number, callback: () => void): void {
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
    this.destroyed = true;
    this.clearTimers();
  }

  // ─── Core Action Helper ───────────────────────────────────────────────────

  private runBattleAction(action: BattleTurnSceneAction): BattlePhaseActionResult | null {
    PhaseManager.transition(action);
    return PhaseManager.getLastBattleTransition();
  }

  // ─── Attack Animation ─────────────────────────────────────────────────────

  private playAttackAnimation(unitId: string): void {
    const unitView = this.deps.unitViews.get(unitId);
    unitView?.setSpriteState("attack");
    this.schedule(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) unitView?.setSpriteState("idle");
    });
  }

  // ─── Winner Handling ──────────────────────────────────────────────────────

  private handleBattleWinner(result: BattlePhaseActionResult | null): boolean {
    if (!result?.winner) return false;
    this.clearTimers(); // cancel pending turn callbacks before game-over
    this.schedule(BattleTurnFlowController.DELAY_GAMEOVER, () => {
      this.deps.showGameOver(result.winner!);
    });
    return true;
  }

  // ─── Combat Entry Point ───────────────────────────────────────────────────

  beginCombat(): void {
    PhaseManager.transition({ type: "battle_begin_combat" });
    this.deps.setStatus("");
    this.deps.setBattleLogVisible(true);
    this.startActiveUnitTurn(GameState.get());
  }

  // ─── Turn Flow ────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    this.pendingTargetCoord = null;
    this.clearSkillIcons();

    const result = this.runBattleAction({ type: "battle_start_turn" });
    if (!result) return;

    // 'none' means empty queue or battle already ended — nothing to commit
    if (!result.directive || result.directive.type === "none") return;

    // activeUnit before turn start — only needed for presentBattleEvents style hint
    const activeUnit = state.units.get(state.roundQueue[0]);
    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.deps.updateManualButtons(result.state);

    switch (result.directive.type) {
      case "continue_immediately": {
        // Queue recovery: active unit was missing; battle_start_turn advanced queue.
        // Effect ticks may have killed units — check before recursing.
        if (this.handleBattleWinner(result)) return;
        this.startActiveUnitTurn(result.state);
        return;
      }

      case "schedule_next_turn": {
        // Melee unit was blocked; battle_start_turn advanced queue.
        if (this.handleBattleWinner(result)) return;
        this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
          this.startActiveUnitTurn(result.state),
        );
        return;
      }

      case "schedule_auto_turn": {
        const unit = result.state.units.get(result.directive.activeUnitId);
        this.deps.battlePresentation.applyDirectivePresentation({
          directive: result.directive,
          unitName: unit?.name ?? null,
        });

        const delay = result.directive.delayKind === "auto_player"
          ? BattleTurnFlowController.DELAY_AUTO_THINK
          : BattleTurnFlowController.DELAY_ENEMY_THINK;
        this.schedule(delay, () => this.autoTurn());
        return;
      }

      case "await_manual_target": {
        const phase = PhaseManager.getPhase();
        const activeUnit = phase.type === "battle" ? phase.activeUnit : null;

        const presentation = this.deps.battlePresentation.applyDirectivePresentation({
          directive: result.directive,
          unitName: activeUnit?.name ?? null,
        });

        if (presentation.displaySkillBar && activeUnit) {
          this.showSkillIcons(activeUnit);
        }
        return;
      }
    }
  }

  // ─── Cell Click (Manual Targeting) ───────────────────────────────────────

  handleCellClick(coord: CellCoord, phase: BattlePhase): void {
    if (phase.battlePhase !== "select_target") return;
    if (!phase.activeUnitId) return;

    const isValid = phase.validTargets.some(
      c => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const p = this.pendingTargetCoord;
    if (p && p.side === coord.side && p.row === coord.row && p.col === coord.col) {
      this.pendingTargetCoord = null;
      this.deps.refreshCells(phase);
      this.handleTargetSelect(coord, phase);
    } else {
      this.pendingTargetCoord = coord;
      this.deps.battlePresentation.applySkillPreview(phase, coord);
    }
  }

  private handleTargetSelect(coord: CellCoord, phase: BattlePhase): void {
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
      this.startActiveUnitTurn(result.state),
    );
  }

  // ─── Auto Turn ────────────────────────────────────────────────────────────

  private autoTurn(): void {
    // Core decides what the auto unit will do — no state mutation.
    const decided = this.runBattleAction({ type: "battle_decide_auto_turn" });
    if (!decided) return;

    const directive = decided.autoTurnDirective;

    if (!directive || directive.type === "none") return;

    if (directive.type === "handoff_manual" || directive.type === "restart_turn") {
      this.startActiveUnitTurn(decided.state);
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

  private applyAutoTurnAndPresent(intention: AutoTurnIntention): void {
    const applied = this.runBattleAction({ type: "battle_apply_auto_turn" });
    if (!applied) return;

    // Stale-intention guard: if mode changed or battle ended during DELAY_AUTO_IMPACT,
    // core returns autoTurnApplied: false — do not schedule another turn.
    if (!applied.autoTurnApplied) return;

    this.deps.battlePresentation.presentBattleEvents(applied.events, intention.activeUnitSide);

    if (this.handleBattleWinner(applied)) return;

    this.schedule(BattleTurnFlowController.DELAY_AUTO_NEXT, () =>
      this.startActiveUnitTurn(applied.state),
    );
  }

  // ─── Quick Battle ─────────────────────────────────────────────────────────

  runQuickBattle(): void {
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
        const state = GameState.get();
        const unitId = state.roundQueue[0];
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

    // Existing fallback: if MAX_ITERATIONS hit without a winner, declare player victory.
    this.schedule(200, () => this.deps.showGameOver(finalWinner ?? "player"));
  }

  // ─── Skip / Charge ────────────────────────────────────────────────────────

  skipTurn(): void {
    // Pre-action active unit: used only as style hint for presentBattleEvents.
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);

    const result = this.runBattleAction({ type: "battle_skip_turn", reason: "manual_skip" });
    if (!result) return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.deps.updateManualButtons(result.state);

    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  chargeTurn(): void {
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);

    const result = this.runBattleAction({ type: "battle_charge_turn" });
    if (!result) return;

    this.deps.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.deps.updateManualButtons(result.state);

    // Charge does not deal damage, but withWinner() wraps defensively — respect it.
    if (this.handleBattleWinner(result)) return;

    this.schedule(BattleTurnFlowController.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  // ─── Auto-Mode Toggle ─────────────────────────────────────────────────────

  toggleAutoMode(): void {
    if (GameState.getBattleMode() === "auto") {
      PhaseManager.transition({ type: "battle_set_mode", mode: "manual" });
      this.deps.updateManualButtons(GameState.get());
      return;
    }
    if (GameState.getBattleMode() !== "manual") return;

    PhaseManager.transition({ type: "battle_set_mode", mode: "auto" });
    this.deps.updateManualButtons(GameState.get());

    const s = GameState.get();
    if (s.phase === "select_target") {
      const active = s.units.get(s.roundQueue[0]);
      if (active?.anchor.side === "player") {
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
  }

  // ─── Skill Bar ────────────────────────────────────────────────────────────

  private showSkillIcons(unit: BattleUnitSnapshot): void {
    if (unit.skills.length < 1) { this.deps.skillBar.hide(); return; }

    const iconSize = Math.round(20 * LAYOUT_SCALE);
    const iconGap  = Math.round(3  * LAYOUT_SCALE);

    const occupiedCells = getOccupiedCells(unit.anchor, unit.shape);
    const rightmostCol  = Math.max(...occupiedCells.map(c => c.col)) as Col;
    const topRow        = Math.min(...occupiedCells.map(c => c.row));
    const bottomRow     = Math.max(...occupiedCells.map(c => c.row));

    const rightCellPos = this.deps.cellPixelPos(unit.anchor.side, topRow, rightmostCol);
    const iconX        = rightCellPos.x + CELL_SIZE / 2 + iconGap + iconSize / 2;

    const unitTopY    = this.deps.cellPixelPos(unit.anchor.side, topRow,    rightmostCol).y - CELL_SIZE / 2;
    const unitBottomY = this.deps.cellPixelPos(unit.anchor.side, bottomRow, rightmostCol).y + CELL_SIZE / 2;
    const unitCenterY = (unitTopY + unitBottomY) / 2;
    const totalH      = unit.skills.length * iconSize + (unit.skills.length - 1) * iconGap;
    const startY      = unitCenterY - totalH / 2 + iconSize / 2;

    this.deps.skillBar.show(unit, iconX, startY, iconSize, iconGap, i => this.switchActiveSkill(i));
  }

  private clearSkillIcons(): void {
    this.deps.skillBar.hide();
  }

  private switchActiveSkill(index: number): void {
    const result = this.runBattleAction({ type: "battle_select_skill", skillIndex: index });
    if (!result) return;

    this.pendingTargetCoord = null;

    const phase = PhaseManager.getPhase();
    const activeUnit = phase.type === "battle" ? phase.activeUnit : null;
    const skill = activeUnit ? getActiveSkill(activeUnit) : undefined;

    if (!activeUnit || !skill) return;

    this.deps.setStatus(
      buildManualTargetStatusText(
        isEnchantmentSkill(skill) ? "heal" : "attack",
        activeUnit.name,
      ),
    );
    this.showSkillIcons(activeUnit);
  }
}

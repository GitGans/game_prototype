import { describe, it, expect } from "vitest";
import {
  projectPreviewTarget,
  buildBattleFieldUnitCellsSnapshot,
  buildBattleUnitSnapshots,
} from "../../src/core/battleSnapshotBuilder";
import type { BattleState } from "../../src/battle/types";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { makeUnit } from "../battle/helpers/units";
import { coord } from "../battle/helpers/coords";

// Derive the snapshot maps projectPreviewTarget consumes from a real BattleState.
function snapshots(state: BattleState) {
  return {
    fieldUnitCells: buildBattleFieldUnitCellsSnapshot(state),
    unitsById: new Map(buildBattleUnitSnapshots(state).map(u => [u.id, u])),
  };
}

describe("projectPreviewTarget", () => {
  it("resolves a living enemy for a damage target", () => {
    const player = makeUnit({ id: "p1", side: "player" });
    const enemy = makeUnit({ id: "e1", side: "enemy" });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: player, anchor: coord("player", 0, 0) },
        { unit: enemy, anchor: coord("enemy", 0, 0) },
      ],
    });
    const target = coord("enemy", 0, 0);

    const result = projectPreviewTarget({
      battlePhase: "select_target",
      previewTargetCoord: target,
      validTargets: [target],
      hasActiveUnit: true,
      targetHighlightKind: "target",
      ...snapshots(state),
    });

    expect(result.previewTargetUnitId).toBe("e1");
    expect(result.previewTargetCoord).toEqual(target);
  });

  it("resolves a living friendly for a heal target", () => {
    const healer = makeUnit({ id: "p1", side: "player" });
    const ally = makeUnit({ id: "p2", side: "player" });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: healer, anchor: coord("player", 0, 0) },
        { unit: ally, anchor: coord("player", 1, 0) },
      ],
    });
    const target = coord("player", 1, 0);

    const result = projectPreviewTarget({
      battlePhase: "select_target",
      previewTargetCoord: target,
      validTargets: [target],
      hasActiveUnit: true,
      targetHighlightKind: "heal_target",
      ...snapshots(state),
    });

    expect(result.previewTargetUnitId).toBe("p2");
  });

  it("resolves a dead friendly for a revive target (present only in fieldUnitCells)", () => {
    const healer = makeUnit({ id: "p1", side: "player" });
    const corpse = makeUnit({ id: "p2", side: "player", lifeState: "dead", hp: 0 });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: healer, anchor: coord("player", 0, 0) },
        { unit: corpse, anchor: coord("player", 1, 0) },
      ],
    });
    const target = coord("player", 1, 0);

    const snaps = snapshots(state);
    // Guard: a dead unit does not appear in living occupancy, only in fieldUnitCells.
    expect(snaps.fieldUnitCells.cellToUnitIds.get("player:1:0")).toEqual(["p2"]);

    const result = projectPreviewTarget({
      battlePhase: "select_target",
      previewTargetCoord: target,
      validTargets: [target],
      hasActiveUnit: true,
      targetHighlightKind: "revive_target",
      ...snaps,
    });

    expect(result.previewTargetUnitId).toBe("p2");
  });

  describe("overlapping living + dead on the same cell", () => {
    // fieldUnitCells lists living first, so naive [0] would always pick the living unit.
    function overlapState(): BattleState {
      const living = makeUnit({ id: "living", side: "player" });
      const dead = makeUnit({ id: "dead", side: "player", lifeState: "dead", hp: 0 });
      return makeBattleStateFromUnits({
        field: [
          { unit: living, anchor: coord("player", 0, 0) },
          { unit: dead, anchor: coord("player", 0, 0) },
        ],
      });
    }

    it("picks the dead unit for a revive target", () => {
      const state = overlapState();
      const target = coord("player", 0, 0);
      expect(state.units.size).toBe(2);

      const result = projectPreviewTarget({
        battlePhase: "select_target",
        previewTargetCoord: target,
        validTargets: [target],
        hasActiveUnit: true,
        targetHighlightKind: "revive_target",
        ...snapshots(state),
      });

      expect(result.previewTargetUnitId).toBe("dead");
    });

    it("picks the living unit for a damage/heal target", () => {
      const state = overlapState();
      const target = coord("player", 0, 0);

      const result = projectPreviewTarget({
        battlePhase: "select_target",
        previewTargetCoord: target,
        validTargets: [target],
        hasActiveUnit: true,
        targetHighlightKind: "target",
        ...snapshots(state),
      });

      expect(result.previewTargetUnitId).toBe("living");
    });
  });

  it("is strict: no fallback when the only occupant has the wrong life state", () => {
    // Cell has only a living unit, but the kind is revive_target → no match → null.
    const living = makeUnit({ id: "living", side: "player" });
    const state = makeBattleStateFromUnits({
      field: [{ unit: living, anchor: coord("player", 0, 0) }],
    });
    const target = coord("player", 0, 0);

    const result = projectPreviewTarget({
      battlePhase: "select_target",
      previewTargetCoord: target,
      validTargets: [target],
      hasActiveUnit: true,
      targetHighlightKind: "revive_target",
      ...snapshots(state),
    });

    expect(result.previewTargetUnitId).toBeNull();
  });

  it("yields exactly one id for a multi-cell (AoE-shaped) unit", () => {
    const player = makeUnit({ id: "p1", side: "player" });
    // 2-cell horizontal unit occupying (enemy,0,0) and (enemy,0,1).
    const bigEnemy = makeUnit({
      id: "e1",
      side: "enemy",
      shape: { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] },
    });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: player, anchor: coord("player", 0, 0) },
        { unit: bigEnemy, anchor: coord("enemy", 0, 0) },
      ],
    });
    const target = coord("enemy", 0, 1); // a non-anchor cell of the same unit

    const result = projectPreviewTarget({
      battlePhase: "select_target",
      previewTargetCoord: target,
      validTargets: [coord("enemy", 0, 0), target],
      hasActiveUnit: true,
      targetHighlightKind: "target",
      ...snapshots(state),
    });

    // A single string id, never an array / multiple units.
    expect(result.previewTargetUnitId).toBe("e1");
  });

  describe("invalidation (collapses to null)", () => {
    const player = makeUnit({ id: "p1", side: "player" });
    const enemy = makeUnit({ id: "e1", side: "enemy" });
    const baseState = makeBattleStateFromUnits({
      field: [
        { unit: player, anchor: coord("player", 0, 0) },
        { unit: enemy, anchor: coord("enemy", 0, 0) },
      ],
    });
    const target = coord("enemy", 0, 0);
    const base = {
      previewTargetCoord: target,
      validTargets: [target],
      hasActiveUnit: true,
      targetHighlightKind: "target" as const,
      ...snapshots(baseState),
    };

    it("returns null when the coord is no longer a valid target (e.g. after skill switch)", () => {
      const result = projectPreviewTarget({ ...base, battlePhase: "select_target", validTargets: [] });
      expect(result).toEqual({ previewTargetCoord: null, previewTargetUnitId: null });
    });

    it("returns null when not in the select_target phase (e.g. after use/advance)", () => {
      const result = projectPreviewTarget({ ...base, battlePhase: "end" });
      expect(result).toEqual({ previewTargetCoord: null, previewTargetUnitId: null });
    });

    it("returns null when there is no active unit", () => {
      const result = projectPreviewTarget({ ...base, battlePhase: "select_target", hasActiveUnit: false });
      expect(result).toEqual({ previewTargetCoord: null, previewTargetUnitId: null });
    });

    it("returns null when there is no stored preview coord", () => {
      const result = projectPreviewTarget({ ...base, battlePhase: "select_target", previewTargetCoord: null });
      expect(result).toEqual({ previewTargetCoord: null, previewTargetUnitId: null });
    });
  });
});

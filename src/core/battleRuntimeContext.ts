import { buildOccupancy } from "../battle/occupancy";
import { type TurnContext, createTurnContext } from "../battle/turnResolver";
import type { BattleState, BattleMode } from "../battle/types";
import type { ReadonlyItemUseEffect } from "../shared/itemTypes";
import type { CellCoord, Side } from "../shared/gridTypes";
import type { PlayerSessionSource } from "./playerSessionState";

export type BattleExitOutcome = "victory" | "defeat";

/** Snapshot of one player unit at the moment of battle exit — pre-level-up. */
export interface BattleParticipant {
  readonly templateId: string;
  readonly name: string;
  readonly level: number; // current level BEFORE +1
  readonly isAlive: boolean;
  readonly wasOnBench: boolean;
  readonly spriteKey: string | null;
}

export interface EnemyReplayPlacement {
  readonly templateId: string;
  readonly anchor: CellCoord;
  readonly level: number;
}

/**
 * The captured data needed to reconstruct one encounter's enemy formation on replay.
 * The encounter ID lives on the battle phase and is deliberately not duplicated here —
 * replay restores the captured placements and never regenerates a group.
 */
export interface BattleReplaySetup {
  readonly enemyPlacements: readonly EnemyReplayPlacement[];
}

/**
 * Read-only description of the item equipped in one player unit's usable_slot at attempt start.
 *
 * ── Why it lives on the runtime context and not on `BattleState`/`Unit` ─────────────────────
 * This is attempt-scoped data that outlives every state transform and feeds settlement when the
 * attempt is completed —
 * the same role `participants` already plays. `BattleState` and `Unit` are rebuilt by every
 * transform, so a field here would have to be threaded through placement, death and revive for
 * a value no battle rule reads. Keeping it here also means an unused potion stays associated
 * with its owner while a used one does not return when that owner is revived, without a single
 * line in those transforms.
 *
 * Battle domain functions never receive this whole record: they get a narrow
 * `BattleItemResource` (`{ instanceId, name, effect }`) — enough to match the requested instance
 * and read the authored amount, and nothing that could reach an inventory or a session.
 */
export interface BattleUsableResource {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly sprite: string | null;
  /**
   * Deeply readonly: a plain `readonly effect: ItemUseEffect` would still allow
   * `resource.effect.amount = 0`, bypassing the exclusive runtime-write owner.
   */
  readonly effect: ReadonlyItemUseEffect;
  readonly unitTemplateId: string;
}

/**
 * One consumption event inside THIS attempt, settled only if the attempt is completed.
 *
 * It is an attempt-local log, not a second inventory: the persistent removal happens exactly
 * once, on a `victory`/`defeat` exit (`core/battleItemSettlement.ts`); an abandoned or replayed
 * attempt's log is dropped with the runtime. No slot is stored —
 * `usable_slot` is the only slot a usable item can occupy, and settlement re-derives it through
 * inventory validation rather than trusting a value carried across a boundary.
 */
export interface BattleItemConsumptionRecord {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly unitTemplateId: string;
}

export type AutoTurnIntention =
  | {
      readonly type: "skip_turn";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly reason: "blocked_melee";
      readonly activeUnitSide: Side;
    }
  | {
      readonly type: "advance_turn";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly activeUnitSide: Side;
    }
  | {
      readonly type: "use_skill";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly target: CellCoord;
      readonly activeUnitSide: Side;
    };

/**
 * All authoritative data for exactly one active battle attempt.
 *
 * **Read-only at every runtime-owned depth.** `requireBattleRuntimeForPhase()`
 * (`battleRuntimeAccess.ts`) hands this back as-is, so holding a runtime is the authority
 * to *read* it and nothing more: a change is made by constructing a complete replacement
 * and installing it through `battleRuntimeWriteAccess`, which only `battlePhaseEffects`
 * may import. The one documented exception is the `ActionSkillDefinition` entries inside
 * `unit.skills` — shared immutable static content from the SKILLS registry, not
 * runtime-owned; the containing array is readonly. `readonly` is erased at runtime, so
 * the defensive copies below remain the runtime guarantee and are not redundant with it.
 *
 * A battle phase is active if and only if this is non-null. `runtime.sessionSource`
 * must always equal the active battle phase's `sessionSource` — validated by
 * `requireBattleRuntimeForPhase()` at every production read and mutation site, not only
 * when the render snapshot is built. `BattleRuntimeContext` is never serialized and
 * never exposed to scenes directly — `GamePhase.participants` is a separate, copied
 * render projection, not an alias of `runtime.participants`.
 */
export interface BattleRuntimeContext {
  readonly state: BattleState;
  readonly participants: readonly BattleParticipant[];
  readonly replaySetup: BattleReplaySetup;
  readonly turnContext: TurnContext;
  readonly mode: BattleMode;
  readonly sessionSource: PlayerSessionSource;
  readonly pendingAutoTurnIntention: AutoTurnIntention | null;
  /** Keyed by BATTLE unit id. An entry is removed the moment its item is consumed. */
  readonly usableResources: ReadonlyMap<string, BattleUsableResource>;
  /**
   * The ACTIVE unit's equipped item currently in targeting mode, or null. Transient manual-action
   * state that lives beside the resource it names — an item identity never enters BattleState.
   * Together with `state.validTargets` and `state.previewTargetCoord` it forms the manual
   * targeting interaction, which is kept coherent at every committed transition. Written only by
   * battlePhaseEffects, from an explicit handler instruction or the mode-change rule.
   */
  readonly selectedUsableInstanceId: string | null;
  readonly consumedItems: readonly BattleItemConsumptionRecord[];
}

export function createEmptyBattleState(): BattleState {
  return {
    units: new Map(),
    occupancy: buildOccupancy(new Map(), new Map()),
    roundQueue: [],
    phase: "placement",
    validTargets: [],
    nextPlayerId: 1,
    placementSelection: {
      selectedBenchUnitId: null,
      selectedFieldUnitId: null,
    },
    previewTargetCoord: null,
    deployments: new Map(),
    benchSlotCount: 0,
  };
}

function copyReplaySetup(setup: BattleReplaySetup): BattleReplaySetup {
  return {
    enemyPlacements: setup.enemyPlacements.map((p) => ({
      ...p,
      anchor: { ...p.anchor },
    })),
  };
}

export function createBattleRuntimeContext(input: {
  state: BattleState;
  participants: readonly BattleParticipant[];
  replaySetup: BattleReplaySetup;
  sessionSource: PlayerSessionSource;
  usableResources?: ReadonlyMap<string, BattleUsableResource>;
}): BattleRuntimeContext {
  return {
    state: input.state,
    participants: input.participants.map((p) => ({ ...p })),
    replaySetup: copyReplaySetup(input.replaySetup),
    turnContext: createTurnContext(),
    mode: "manual",
    sessionSource: input.sessionSource,
    pendingAutoTurnIntention: null,
    // Copied entry by entry, effects included: a forwarded reference would let a runtime holder
    // edit the catalog's authored data. Copying only the Map is not enough.
    usableResources: new Map(
      [...(input.usableResources ?? new Map())].map(([unitId, resource]) => [
        unitId, { ...resource, effect: { ...resource.effect } },
      ]),
    ),
    // Every attempt — new or replayed — starts with no item in targeting mode.
    selectedUsableInstanceId: null,
    // Every attempt starts with nothing consumed — including a replay, which is what makes a
    // discarded attempt's potion come back.
    consumedItems: [],
  };
}

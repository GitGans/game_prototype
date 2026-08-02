import type { UnitLifeState } from '../shared/unitTypes';
import type { BattleState } from '../battle/types';
import type { PlayerUnitState, RosterState } from '../progression';

export type PartialPlayerUnitState = Partial<PlayerUnitState> | undefined;

export function getPersistentLifeState(s: PartialPlayerUnitState): UnitLifeState {
  return s?.lifeState ?? 'alive';
}

export function getPersistentCurrentHp(s: PartialPlayerUnitState): number | null {
  return s?.currentHp ?? null;
}

export function isPersistentPlayerUnitAlive(s: PartialPlayerUnitState): boolean {
  return getPersistentLifeState(s) === 'alive';
}

export function clampAliveCurrentHp(currentHp: number | null, maxHp: number): number {
  if (currentHp === null) return maxHp;
  return Math.max(1, Math.min(maxHp, currentHp));
}

export interface PlayerRuntimeSnapshot {
  hp: number;
  maxHp: number;
  lifeState: UnitLifeState;
}

export interface PlayerExitInput {
  templateId: string;
  runtime: PlayerRuntimeSnapshot;      // required — no missing-runtime fallback
}

/** Runtime HP/life snapshot → persistent HP/life. Placement is handled separately. */
export function computeBattleExitPlayerPersistence(
  runtime: PlayerRuntimeSnapshot,
): { lifeState: UnitLifeState; currentHp: number | null } {
  if (runtime.lifeState !== 'alive' || runtime.hp <= 0) {
    return { lifeState: 'dead', currentHp: 0 };
  }
  if (runtime.hp >= runtime.maxHp) {
    return { lifeState: 'alive', currentHp: null };     // sparse "full HP" form
  }
  return {
    lifeState: 'alive',
    currentHp: Math.max(1, Math.min(runtime.maxHp, runtime.hp)),
  };
}

/**
 * Battle-exit HP/life persistence, source-neutral by construction. A missing roster
 * record is a lifecycle error: runtime player units are projected from the roster, so
 * an exit input without one means the roster changed underneath an active battle.
 */
export function applyBattleExitPlayerPersistence(
  playerUnits: Record<string, PlayerUnitState>,
  exits: readonly PlayerExitInput[],
): Record<string, PlayerUnitState> {
  const next = { ...playerUnits };
  for (const exit of exits) {
    const unitState = next[exit.templateId];
    if (!unitState) {
      throw new Error(
        `applyBattleExitPlayerPersistence: no roster record for templateId "${exit.templateId}"`,
      );
    }
    next[exit.templateId] = { ...unitState, ...computeBattleExitPlayerPersistence(exit.runtime) };
  }
  return next;
}

/**
 * Confirmed-placement persistence: BattleState + RosterState → RosterState.
 *
 * Source-neutral by construction — the caller selects storage, this function never
 * learns which one. Field deployments (living units AND corpses) overwrite
 * `lastPlacement`; bench and undeployed units keep theirs.
 */
export function applyFieldPlacementsToRoster(
  roster: RosterState,
  state:  BattleState,
): RosterState {
  const units: Record<string, PlayerUnitState> = { ...roster.units };

  for (const unit of state.units.values()) {
    if (unit.side !== 'player') continue;

    const deployment = state.deployments.get(unit.id);
    if (deployment?.kind !== 'field') continue; // bench/undeployed: keep the previous placement

    const unitState = units[unit.templateId];
    if (!unitState) {
      // Runtime player units are projected from the roster (battleSetupProjection never
      // synthesizes a record), so a field player without one is a lifecycle error.
      throw new Error(
        `Field player unit "${unit.id}" has no roster record for templateId "${unit.templateId}"`,
      );
    }

    // The anchor is copied: persistent state must never alias a runtime coordinate.
    units[unit.templateId] = { ...unitState, lastPlacement: { ...deployment.anchor } };
  }

  return { units };
}

export interface PlayerLevelUpInput {
  templateId: string;
  newLevel: number;
  newMaxHp: number;
}

export function applyVictoryLevelUpPersistence(
  playerUnits: Record<string, PlayerUnitState>,
  levelUps: PlayerLevelUpInput[],
): Record<string, PlayerUnitState> {
  const next = { ...playerUnits };
  for (const l of levelUps) {
    const us = next[l.templateId];
    if (!us) {
      throw new Error(
        `applyVictoryLevelUpPersistence: no roster record for templateId "${l.templateId}"`,
      );
    }
    let nextCurrentHp = us.currentHp;
    if (us.lifeState === 'alive' && nextCurrentHp !== null) {
      nextCurrentHp = Math.min(nextCurrentHp, l.newMaxHp);
    }
    next[l.templateId] = {
      ...us,
      level: l.newLevel,
      currentHp: nextCurrentHp,
    };
  }
  return next;
}

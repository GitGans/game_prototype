import type { UnitLifeState } from '../shared/unitTypes';
import type { CellCoord } from '../shared/gridTypes';
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
  wasOnBench: boolean;
  runtime: PlayerRuntimeSnapshot | undefined;
  lastFieldPlacement: CellCoord | null;
}

export function computeFieldPlayerPersistence(
  runtime: PlayerRuntimeSnapshot | undefined,
): { lifeState: UnitLifeState; currentHp: number | null } {
  if (!runtime || runtime.lifeState !== 'alive' || runtime.hp <= 0) {
    return { lifeState: 'dead', currentHp: 0 };
  }
  if (runtime.hp >= runtime.maxHp) {
    return { lifeState: 'alive', currentHp: null };
  }
  return {
    lifeState: 'alive',
    currentHp: Math.max(1, Math.min(runtime.maxHp, runtime.hp)),
  };
}

export function applyBattleExitPlayerPersistence(
  playerUnits: Record<string, PlayerUnitState>,
  exits: PlayerExitInput[],
): Record<string, PlayerUnitState> {
  const next = { ...playerUnits };
  for (const e of exits) {
    const us = next[e.templateId];
    if (!us) continue;

    let updated: PlayerUnitState;
    if (e.runtime) {
      const { lifeState, currentHp } = computeFieldPlayerPersistence(e.runtime);
      updated = { ...us, lifeState, currentHp };
    } else if (e.wasOnBench) {
      updated = { ...us, lifeState: 'alive', currentHp: us.currentHp ?? null };
    } else {
      updated = { ...us, lifeState: 'dead', currentHp: 0 };
    }

    if (e.lastFieldPlacement !== null) {
      updated = { ...updated, lastPlacement: e.lastFieldPlacement };
    }
    next[e.templateId] = updated;
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
    if (!us) continue;
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

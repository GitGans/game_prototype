import type { UnitLifeState } from '../shared/unitTypes';
import type { CellCoord } from '../shared/gridTypes';
import type { PlayerUnitState } from './GameState';

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

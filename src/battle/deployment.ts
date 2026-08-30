import type { BattleState, Unit } from './types';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import { isAlive, isDead } from './lifeState';

export function getDeployment(state: BattleState, unitId: string): UnitDeployment | undefined {
  return state.deployments.get(unitId);
}

export function requireDeployment(state: BattleState, unitId: string): UnitDeployment {
  const d = state.deployments.get(unitId);
  if (!d) throw new Error(`requireDeployment: no deployment for unit "${unitId}"`);
  return d;
}

// Returns the field deployment for a unit, or throws if the unit is bench-deployed or missing.
// Use whenever field position (anchor, row, col) is required.
export function requireFieldDeployment(
  state:  BattleState,
  unitId: string,
): Extract<UnitDeployment, { kind: 'field' }> {
  const d = state.deployments.get(unitId);
  if (!d) throw new Error(`requireFieldDeployment: no deployment for unit "${unitId}"`);
  if (d.kind !== 'field') {
    throw new Error(`requireFieldDeployment: unit "${unitId}" is bench-deployed, not field-deployed`);
  }
  return d;
}

export function isFieldUnit(state: BattleState, unitId: string): boolean {
  return state.deployments.get(unitId)?.kind === 'field';
}

export function isBenchUnit(state: BattleState, unitId: string): boolean {
  return state.deployments.get(unitId)?.kind === 'bench';
}

// Returns [unitId, unit] pairs for all field-deployed units, alive and dead.
// Use only when corpses must be enumerated alongside living units (e.g., snapshot,
// future resurrection scans). For combat participants use getLivingFieldUnitEntries.
export function getFieldUnitEntries(state: BattleState): [string, Unit][] {
  return Array.from(state.units.entries()).filter(
    ([id]) => state.deployments.get(id)?.kind === 'field',
  );
}

// Returns all field-deployed units, alive and dead. See getFieldUnitEntries.
export function getFieldUnits(state: BattleState): Unit[] {
  return getFieldUnitEntries(state).map(([, u]) => u);
}

// Living combat participants. The default helper for queue construction,
// game-over checks, enemy-scaling, and any "currently fighting" enumeration.
export function getLivingFieldUnitEntries(state: BattleState): [string, Unit][] {
  return getFieldUnitEntries(state).filter(([, u]) => isAlive(u));
}

export function getLivingFieldUnits(state: BattleState): Unit[] {
  return getLivingFieldUnitEntries(state).map(([, u]) => u);
}

// Corpses on the field — for future resurrection helpers, debug, and tests.
export function getDeadFieldUnitEntries(state: BattleState): [string, Unit][] {
  return getFieldUnitEntries(state).filter(([, u]) => isDead(u));
}

export function getDeadFieldUnits(state: BattleState): Unit[] {
  return getDeadFieldUnitEntries(state).map(([, u]) => u);
}

// Returns the runtime Unit deployed to the given bench slot, or undefined if
// the slot is empty. Reads state.deployments — the runtime source of truth.
export function getBenchSlotOccupant(state: BattleState, slot: number): Unit | undefined {
  for (const [id, deployment] of state.deployments.entries()) {
    if (deployment.kind === 'bench' && deployment.slot === slot) {
      return state.units.get(id);
    }
  }
  return undefined;
}

export function getFreeBenchSlot(state: BattleState): number | null {
  const occupied = new Set<number>();
  for (const deployment of state.deployments.values()) {
    if (deployment.kind === 'bench') occupied.add(deployment.slot);
  }
  for (let slot = 0; slot < state.benchSlotCount; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

// Returns a new deployments map with the entry for unitId removed.
// Use when removing a single known unit from state.units.
export function removeDeployment(
  deployments: ReadonlyMap<string, UnitDeployment>,
  unitId: string,
): Map<string, UnitDeployment> {
  const next = new Map(deployments);
  next.delete(unitId);
  return next;
}

// True entity removal only — e.g., bench eviction, debug remove-unit.
// NOT for ordinary combat death: combat keeps dead units in state.units with
// `lifeState:'dead'` and preserved deployment via killUnit().
export function retainDeploymentsForUnits(
  deployments: ReadonlyMap<string, UnitDeployment>,
  units: ReadonlyMap<string, Unit>,
): Map<string, UnitDeployment> {
  const next = new Map<string, UnitDeployment>();
  for (const [unitId, deployment] of deployments) {
    if (units.has(unitId)) next.set(unitId, deployment);
  }
  return next;
}

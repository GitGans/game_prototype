import type { BattleState, Unit } from './types';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';

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

// Returns [unitId, unit] pairs for all field-deployed units.
export function getFieldUnitEntries(state: BattleState): [string, Unit][] {
  return Array.from(state.units.entries()).filter(
    ([id]) => state.deployments.get(id)?.kind === 'field',
  );
}

export function getFieldUnits(state: BattleState): Unit[] {
  return getFieldUnitEntries(state).map(([, u]) => u);
}

// Stage 1 migration note:
// Real gameplay bench contents still live in BattleState.benchUnits (old path).
// These helpers only read UnitDeployment bench entries created via addBenchUnit()
// and are used in tests or the future bench migration. They return no results in
// normal Stage 1 gameplay since bench units are not yet added to state.units.
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
  deployments: Map<string, UnitDeployment>,
  unitId: string,
): Map<string, UnitDeployment> {
  const next = new Map(deployments);
  next.delete(unitId);
  return next;
}

// Returns a new deployments map containing only entries whose unit id
// exists in the given units map.
// Use in combat.ts AFTER all dead units are removed from newUnits —
// never before or mid-loop.
export function retainDeploymentsForUnits(
  deployments: Map<string, UnitDeployment>,
  units: Map<string, Unit>,
): Map<string, UnitDeployment> {
  const next = new Map<string, UnitDeployment>();
  for (const [unitId, deployment] of deployments) {
    if (units.has(unitId)) next.set(unitId, deployment);
  }
  return next;
}

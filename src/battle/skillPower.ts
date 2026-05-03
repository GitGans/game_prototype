import type { ActiveEffect } from '../shared/activeEffect';
import { effectiveStats } from './combat';
import type { PowerSource } from './skillUsePlan';

export interface UnitPowerOwner {
  physicalStrength: number;
  magicalStrength: number;
}

// Must structurally match StatOwner in combat.ts, which is intentionally local.
export interface EffectiveUnitPowerOwner extends UnitPowerOwner {
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
  activeEffects: readonly ActiveEffect[];
}

export function getRawUnitPower(
  unit: UnitPowerOwner,
  powerSource: PowerSource,
): number {
  switch (powerSource) {
    case 'physical_strength':
      return unit.physicalStrength;
    case 'magical_strength':
      return unit.magicalStrength;
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

export function getEffectiveUnitPower(
  unit: EffectiveUnitPowerOwner,
  powerSource: PowerSource,
): number {
  const stats = effectiveStats(unit);
  switch (powerSource) {
    case 'physical_strength':
      return stats.physicalStrength;
    case 'magical_strength':
      return stats.magicalStrength;
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}


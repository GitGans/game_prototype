import type { ActiveEffect } from '../shared/activeEffect';
import { effectiveStats } from './combat';
import type { PowerSource } from './skillUsePlan';

export interface EffectiveUnitPowerOwner {
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
  activeEffects: readonly ActiveEffect[];
}

export function getEffectiveUnitPower(
  unit: EffectiveUnitPowerOwner,
  powerSource: PowerSource,
): number {
  const stats = effectiveStats(unit);
  switch (powerSource) {
    case 'physical_strength':
      return Math.max(0, stats.physicalStrength);
    case 'magical_strength':
      return Math.max(0, stats.magicalStrength);
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}


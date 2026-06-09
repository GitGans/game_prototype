import type { ActiveEffect } from '../shared/activeEffect';
import { effectiveStats, type EffectiveStats } from './combat';
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

/** Power from stats that are ALREADY effective (active effects already applied). */
export function getUnitPowerFromEffectiveStats(
  stats: Pick<EffectiveStats, 'physicalStrength' | 'magicalStrength'>,
  powerSource: PowerSource,
): number {
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

/** Runtime callers: applies active effects, then delegates. Behavior unchanged. */
export function getEffectiveUnitPower(
  unit: EffectiveUnitPowerOwner,
  powerSource: PowerSource,
): number {
  return getUnitPowerFromEffectiveStats(effectiveStats(unit), powerSource);
}


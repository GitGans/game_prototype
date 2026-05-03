import type { DamageType } from '../shared/skillTypes';
import type { ActiveEffect } from '../shared/activeEffect';
import { effectiveStats } from './combat';
import type { CombatPowerSource, PowerSource } from './skillUsePlan';

export interface UnitPowerOwner {
  physicalDamage: number;
  magicalDamage: number;
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
      return unit.physicalDamage;
    case 'magical_strength':
      return unit.magicalDamage;
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
      return stats.physicalDamage;
    case 'magical_strength':
      return stats.magicalDamage;
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

// Maps CombatPowerSource to the legacy DamageType used by existing combat APIs.
export function getDamageTypeForPowerSource(
  powerSource: CombatPowerSource,
): DamageType {
  switch (powerSource) {
    case 'physical_strength':
      return 'physical';
    case 'magical_strength':
      return 'magical';
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

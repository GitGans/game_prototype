import type { UnitShape } from './gridTypes';
import type { SkillId } from './skillDefinitionTypes';

// ---------------------------------------------------------------------------
// Upgrade Option ID
// ---------------------------------------------------------------------------

declare const __upgradeOptionIdBrand: unique symbol;

/**
 * Branded string that identifies a specific upgrade option within a unit's
 * upgrade tiers. Distinct from SkillId — multiple upgrade options can grant
 * the same skill across different units or tiers.
 *
 * Convention: "{templateId}_{tierId}_{skillKey}"
 * Example:    "soldier_5_pierce"
 *
 * Create only via uid() in data/units/upgradeOptionHelpers.ts. Never cast directly.
 */
export type UpgradeOptionId = string & { readonly [__upgradeOptionIdBrand]: never };

export type SpriteState = 'idle' | 'attack' | 'death';

// UnitLifeState lives in shared/ on purpose: snapshot contracts must not
// depend on battle/. Do not move it.
export type UnitLifeState = 'alive' | 'dead';

export interface SpriteSheetConfig {
  path: string;
  frameWidth: number;
  frameHeight: number;
  states: SpriteState[];
}

export type RowTrait = 'front' | 'back';
export type UnitRace = 'orc' | 'demon' | 'undead';
declare const __unitClassIdBrand: unique symbol;

/**
 * Branded string identifying a unit class.
 * Create only via ucid() in unitTypes.ts. Never cast directly.
 */
export type UnitClassId = string & { readonly [__unitClassIdBrand]: never };

export function ucid(id: string): UnitClassId {
  return id as UnitClassId;
}

export interface UnitClassDefinition {
  id: UnitClassId;
  name: string;
  description?: string;
  icon?: string;
  tags?: readonly string[];
}

export const UNIT_BATTLE_STAT_KEYS = [
  'hp',
  'physicalStrength',
  'magicalStrength',
  'physicalDefense',
  'magicalDefense',
  'dodge',
  'block',
  'initiative',
] as const;

export type UnitBattleStatKey = typeof UNIT_BATTLE_STAT_KEYS[number];

/**
 * Generic full stat-value map — every canonical key present. This is the
 * structural root type. Domain-specific full-map types (UnitBattleStats,
 * BattleStatBonuses) are aliases of this, not separate definitions.
 *
 * Invariant: every additive stat system, normalized full stat map, stat
 * bonus map, zero/default factory, aggregation helper, stat resolver,
 * persisted sparse stat delta, display snapshot, and game-aware stat
 * presentation must be driven by UNIT_BATTLE_STAT_KEYS. A sparse delta's
 * missing key always means "no change" (0) — never an implicit exclusion.
 *
 * Scope note: this invariant does NOT extend to battle-runtime contracts —
 * battle/types.ts Unit (current/max hp is a distinct runtime concept from
 * resolved base hp) and battle/combat.ts EffectiveStats/StatOwner
 * (deliberately excludes hp — active effects modify combat stats, not HP).
 * Those are separate, intentional shapes; do not merge them into this model.
 */
export type UnitBattleStatMap = Record<UnitBattleStatKey, number>;

/** Full resolved stat values for a unit. */
export type UnitBattleStats = UnitBattleStatMap;

/** Sparse additive stat change. Missing keys mean 0, enforced by shared/battleStatUtils.ts. */
export type UnitBattleStatDelta = Partial<Record<UnitBattleStatKey, number>>;

/** Upgrade-tier stat changes — same shape as any other additive stat delta. */
export type UnitProgressionStatModifiers = UnitBattleStatDelta;

export interface UnitUpgradeOption {
  id: UpgradeOptionId;
  name: string;
  skillId: SkillId;            // now required — every option grants a skill
  statModifiers?: UnitProgressionStatModifiers;
  unitSpriteFilename?: string; // optional upgraded-unit appearance
  /**
   * If this upgrade option is chosen, this class id becomes the unit's current class.
   * If omitted, the option does not change the current class.
   */
  classId?: UnitClassId;
}

export interface UnitUpgradeTier {
  unlocksAtLevel: 5 | 10 | 15 | 20;
  options: UnitUpgradeOption[];
}

export interface EnemySkillUnlock {
  unlocksAtLevel: 0 | 5 | 10 | 15 | 20;
  skillId: SkillId;
}

export interface UnitBlueprint {
  templateId: string;
  name: string;
  hp: number;
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;  // percentage 0–100, reduces incoming physical damage
  magicalDefense: number;   // percentage 0–100, reduces incoming magical damage
  dodge: number;            // % chance to avoid damage entirely (effective cap: 90)
  block: number;            // % chance to take only 50% damage (effective cap: 90)
  level: number;
  initiative: number;
  shape: UnitShape;
  baseSkillId?: SkillId;              // player units only; auto-learned at level 0
  upgradeTiers?: UnitUpgradeTier[];   // player units only; tiers 5/10/15/20
  enemySkillUnlocks?: EnemySkillUnlock[];  // enemy units only; replaces skillTiers + levelSkills
  rowTrait: RowTrait;
  baseClassId: UnitClassId;
  spriteFilename?: string;
}

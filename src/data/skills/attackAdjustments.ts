import type { DamageModifierType, SkillLevelTable } from "../../shared/skillTypes";

// ─── Damage Modifier Levels ───────────────────────────────────────────────────
// Values are percentages (0–100) of the stat that is IGNORED.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const DAMAGE_MODIFIER_LEVELS: Record<
  DamageModifierType,
  SkillLevelTable<number>
> = {
  ignore_block: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_dodge: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_physical_defense: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_magical_defense: { 1: 25, 2: 50, 3: 75, 4: 100 },
};

// ─── Vampirism Levels ─────────────────────────────────────────────────────────
// Values are % of total real damage converted to HP.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const VAMPIRISM_LEVELS: SkillLevelTable<number> = {
  1: 25,
  2: 50,
  3: 100,
};

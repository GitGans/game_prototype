import type { PeriodicHpEffectDef, StatEffectDef } from "../../shared/skillTypes";

// ─── Periodic HP Effect Definitions ──────────────────────────────────────────
//
// direction: "buff" | "debuff" — used only for display classification (effectTone).
// Runtime tick direction (heal/damage) and power come from the action's `direction`
// and `powerSource` fields, not from here.

export const PERIODIC_HP_EFFECTS: Record<string, PeriodicHpEffectDef> = {
  regeneration: {
    direction: "buff",
    description: "Restores HP each round",
  },

  lose_health: {
    direction: "debuff",
    description: "Deals damage each round",
  },
};

// ─── Stat Effect Definitions ──────────────────────────────────────────────────
//
// direction: "buff"   → effectTone "positive", bonus applied as +bonusByLevel[level]
// direction: "debuff" → effectTone "negative", bonus applied as -bonusByLevel[level]
// bonusByLevel — unsigned magnitude. Sign is derived from direction at resolution time.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const STAT_EFFECTS: Record<string, StatEffectDef> = {
  fortify: {
    direction: "buff",
    bonusField: "physicalDefenseBonus",
    description: "Increases physical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  weaken: {
    direction: "debuff",
    bonusField: "physicalDefenseBonus",
    description: "Reduces physical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_shield: {
    direction: "buff",
    bonusField: "magicalDefenseBonus",
    description: "Increases magical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_vulnerability: {
    direction: "debuff",
    bonusField: "magicalDefenseBonus",
    description: "Reduces magical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  swift: {
    direction: "buff",
    bonusField: "dodgeBonus",
    description: "Increases dodge chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  clumsy: {
    direction: "debuff",
    bonusField: "dodgeBonus",
    description: "Reduces dodge chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  guard_stance: {
    direction: "buff",
    bonusField: "blockBonus",
    description: "Increases block chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  off_balance: {
    direction: "debuff",
    bonusField: "blockBonus",
    description: "Reduces block chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  haste: {
    direction: "buff",
    bonusField: "initiativeBonus",
    description: "Increases initiative",
    bonusByLevel: { 1: 1, 2: 2, 3: 3 },
  },

  slow: {
    direction: "debuff",
    bonusField: "initiativeBonus",
    description: "Reduces initiative",
    bonusByLevel: { 1: 1, 2: 2, 3: 3 },
  },

  empower: {
    direction: "buff",
    bonusField: "physicalStrengthBonus",
    description: "Increases physical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  enfeeble: {
    direction: "debuff",
    bonusField: "physicalStrengthBonus",
    description: "Reduces physical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_surge: {
    direction: "buff",
    bonusField: "magicalStrengthBonus",
    description: "Increases magical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_drain: {
    direction: "debuff",
    bonusField: "magicalStrengthBonus",
    description: "Reduces magical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },
};

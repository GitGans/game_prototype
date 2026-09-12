export type BattleEvent =
  // ── Enchantment skill (heal path) ──────────────────────────────────
  | { type: 'skill_heal';
      casterId: string; casterName: string;
      targetId: string; targetName: string;
      amount: number }

  // ── Attack skill outcomes ───────────────────────────────────────────
  | { type: 'skill_damage';
      casterId: string; casterName: string;
      targetId: string; targetName: string;
      amount: number; blocked: boolean }

  | { type: 'skill_dodged';
      casterId: string; casterName: string;
      targetId: string; targetName: string }

  // ── Item activation (equipped usable_slot item, manual turn) ────────
  // A distinct variant rather than a reused skill_heal: the source is an item, the wording
  // names it, and nothing about it is a skill (no caster/target pair, no skill index).
  | { type: 'item_heal';
      unitId: string; unitName: string;
      itemName: string; amount: number }

  // ── Post-damage (vampirism) ─────────────────────────────────────────
  | { type: 'vampirism_heal';
      unitId: string; unitName: string; amount: number }

  // ── Effect application ──────────────────────────────────────────────
  | { type: 'effect_applied';
      unitId: string; unitName: string; effectDisplayName: string }

  // ── Probability effect rolls ─────────────────────────────────────────
  | { type: 'probability_effect_applied';
      unitId: string; unitName: string; displayName: string }
  | { type: 'probability_effect_failed';
      unitId: string; unitName: string; displayName: string }

  // ── Queue changes from probability effects ──────────────────────────
  | { type: 'unit_distracted';
      unitId: string; unitName: string }

  // ── Counter-attack flow ──────────────────────────────────────────────
  | { type: 'counter_attack_start';
      attackerId: string; attackerName: string;
      targetId: string; targetName: string }

  // targetName: filled only for 'out_of_range'
  | { type: 'counter_attack_unavailable';
      unitId: string; unitName: string;
      reason: 'caster_dead' | 'no_basic_attack' | 'out_of_range';
      targetName?: string }

  // ── Turn-level events (normalized from TurnEvent) ──────────────────────
  | { type: 'turn_skipped';
      unitId: string; unitName: string;
      reason: 'manual_skip' | 'blocked_melee' }

  | { type: 'turn_charged';
      unitId: string; unitName: string }

  // ── Round-end effect ticks (normalized from TurnEvent round_effect) ────
  | { type: 'effect_tick_heal';
      unitId: string; unitName: string;
      effectDisplayName: string; amount: number }

  | { type: 'effect_tick_damage';
      unitId: string; unitName: string;
      effectDisplayName: string; amount: number }

  | { type: 'effect_expired';
      unitId: string; unitName: string;
      effectDisplayName: string }

  // ── Revive ──────────────────────────────────────────────────────────
  | { type: 'unit_revived';
      casterId: string; casterName: string;
      targetId: string; targetName: string;
      amount: number };

import type { GamePhase } from './phases';
import type { ItemInteraction } from '../shared/snapshotTypes';
import { readItemInteractionSlot } from './itemInteractionStorage';

/**
 * The READ gateway for the pending item interaction. `readItemInteractionForPhase` is its
 * entire public surface, pinned in `RUNTIME_OWNERSHIP_EXPORT_POLICIES` — a closed surface is what
 * stops the write capability being forwarded through the read side under another name.
 *
 * Read-only by responsibility: it exposes this lookup and nothing else. Recording and disposing
 * confirmations belongs to the write gateway, importable only by the phase handler that owns the
 * lifecycle.
 *
 * ── What "justified" means ──────────────────────────────────────────────────────────────────
 * An interaction is returned only when the supplied phase can account for it: an equip screen, whose
 * OWN session holds the request, still showing the character the request targets. This is the
 * ownership assertion `requireBattleRuntimeForPhase` performs for the battle runtime, expressed
 * as a filter rather than a throw because an unjustified request is a normal state (the screen
 * moved on), not corruption.
 *
 * ── What this is NOT for ────────────────────────────────────────────────────────────────────
 * This is the SNAPSHOT's filter (hide a prompt the screen cannot justify) and the confirm-time
 * ownership check. It is deliberately NOT how disposal finds a stale request: it returns null in
 * exactly the cases teardown exists to clean up — screen left, character changed — so a teardown
 * built on it would leave the request in storage to reappear on return. Disposal is owner-keyed
 * and unconditional; see `teardownItemInteractionAfterTransition`.
 */
export function readItemInteractionForPhase(phase: GamePhase): ItemInteraction | null {
  if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return null;

  const pending = readItemInteractionSlot(phase.sessionSource);
  if (pending === null) return null;
  if (pending.unitTemplateId !== phase.selectedUnitTemplateId) return null;

  return pending;
}

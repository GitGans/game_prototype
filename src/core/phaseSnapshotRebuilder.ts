import type { GamePhase } from './phases';
import { GameState } from './GameState';
import { PlayerSessionStore } from './playerSessionStore';
import { requireBattleRuntimeForPhase } from './battleRuntimeAccess';
import { buildBattlePhaseSnapshot } from './battlePhaseSnapshot';
import { buildEquipmentScreenPlayerSnapshot } from './equipmentScreenSnapshot';
import { buildRosterCampSnapshot } from './rosterCampSnapshot';
import { buildUpgradeTreePlayerSnapshot } from './upgradeTreeSnapshot';
import { buildBattleResultsSnapshot } from './battleResultsSnapshot';
import { projectWorldMapSnapshot } from './worldMapProjection';
import { readItemInteractionForPhase } from './itemInteractionAccess';

/**
 * Recomputes the data snapshot for one phase from authoritative state.
 *
 * Read-only: it resolves state through `GameState` / `PlayerSessionStore` and delegates every
 * formula to a projection module. Called after `phaseActionEffects.apply()` and after battle
 * teardown, so it always observes post-effect state.
 *
 * The switch is exhaustive by construction — a new `GamePhase` variant is a compile error
 * here, forcing an explicit "does this phase carry a snapshot?" decision.
 */
export function rebuildPhaseSnapshot(phase: GamePhase): GamePhase {
  switch (phase.type) {
    // ── Snapshotless phases: returned by identity, never copied. ──
    case 'main_menu':
    case 'map_victory':
    case 'debug_level_select':
      return phase;

    case 'world_map': {
      // CampaignState.world is authoritative — mapId/partyPos/mapState on the incoming
      // phase are placeholders and are always overwritten, never trusted.
      return { ...phase, ...projectWorldMapSnapshot(GameState.getCampaignState()) };
    }

    case 'equip_screen': {
      const session = PlayerSessionStore.getSession(phase.sessionSource);
      // READ-ONLY. The gateway hands back a request only when this phase can justify it; an
      // unjustifiable one is simply not projected, which HIDES the dialog. Disposing it belongs
      // to phaseHandlers/consumablePhaseHandler — this module holds no write capability.
      const snapshot = buildEquipmentScreenPlayerSnapshot(
        session, phase.selectedUnitTemplateId, readItemInteractionForPhase(phase),
      );
      return { ...phase, ...snapshot };
    }

    case 'debug_equip_screen': {
      const session = PlayerSessionStore.getSession(phase.sessionSource);
      const equipSnapshot = buildEquipmentScreenPlayerSnapshot(
        session, phase.selectedUnitTemplateId, readItemInteractionForPhase(phase),
      );
      const { campUnitIds, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
        buildRosterCampSnapshot(session.roster);
      return {
        ...phase, ...equipSnapshot, campUnitIds,
        selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle,
      };
    }

    case 'camp': {
      const session = PlayerSessionStore.getSession(phase.sessionSource);
      const { units, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
        buildRosterCampSnapshot(session.roster);
      return { ...phase, units, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle };
    }

    case 'upgrade_tree': {
      const session = PlayerSessionStore.getSession(phase.sessionSource);
      const { unitName, upgradeTiers } =
        buildUpgradeTreePlayerSnapshot(session.roster, phase.unitTemplateId);
      return { ...phase, unitName, upgradeTiers };
    }

    case 'battle_results': {
      // Deliberately does NOT touch battle runtime: it is already cleared by the time this
      // runs. Result cards are derived from the roster the exit pipeline just wrote, plus
      // the immutable presentation metadata in participantSeeds — never from the
      // battle-start participant snapshot.
      const session = PlayerSessionStore.getSession(phase.sessionSource);
      return {
        ...phase,
        units: buildBattleResultsSnapshot(session.roster, phase.participantSeeds),
      };
    }

    case 'battle': {
      const runtime = requireBattleRuntimeForPhase(phase);
      return buildBattlePhaseSnapshot(phase, runtime);
    }

    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

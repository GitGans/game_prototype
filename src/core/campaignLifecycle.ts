import { initCampaignState } from './initCampaignState';
import { GameState } from './GameState';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../data/campaignInitialStateDefinition';

/**
 * The single owner of application-level campaign creation. It exists so the production data
 * catalogs (`PLAYER_UNITS`, `ITEM_CATALOG`, `CAMPAIGN_STARTING_ITEMS`, `MAP_DEFINITIONS`,
 * `CAMPAIGN_INITIAL_STATE_DEFINITION`) stay out of `phaseActionEffects`, which must not know
 * what a campaign is made of — only when one should be created.
 *
 * Sibling of `debugLifecycle.ts`: that module owns the debug session *container* lifecycle,
 * this one owns the campaign container. Neither owns the cross-domain sequencing around it.
 */

/**
 * Installs a freshly built campaign, replacing any existing progress. Always creates — there
 * is no idempotent guard, because `new_game` is defined as "discard and restart".
 *
 * Deliberately narrow: this owns *campaign* construction only. Clearing debug state, disposing
 * the battle runtime and resetting the gameplay RNG streams are cross-domain sequencing
 * decisions owned by `phaseActionEffects`, not by this module.
 */
export function initializeNewCampaign(): void {
  GameState.setCampaignState(initCampaignState({
    playerUnits:    PLAYER_UNITS,
    itemCatalog:    ITEM_CATALOG,
    startingItems:  CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState:   CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
}

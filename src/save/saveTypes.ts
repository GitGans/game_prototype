import type { CampaignState } from '../campaign';

/**
 * Future-facing save boundary. Only `CampaignState` crosses it — no `DebugBattleState`,
 * no `BattleRuntimeContext`/`BattleState`, no `GamePhase`, no `PlayerSessionSource`,
 * no `GameState`, no Phaser/scene/UI types. No implementation exists yet: no disk/browser
 * storage, serialization, migrations, UI, or save actions belong in this stage.
 */
export interface SaveRepository {
  load(saveId: string): CampaignState;
  save(saveId: string, state: CampaignState): void;
}

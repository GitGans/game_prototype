export type GamePhase =
  | { type: 'main_menu' }
  | { type: 'world_map'; mapId: string; partyPos: { x: number; y: number } }
  | { type: 'map_victory'; mapId: string }
  | {
      type: 'battle';
      enemyGroupId: string;
      returnPhase: GamePhase;
      triggerPos?: { x: number; y: number };
      mapId?: string;
    }
  | { type: 'camp';      returnPhase: GamePhase }
  | { type: 'debug_prep' };

export type PhaseAction =
  | { type: 'play' }
  | { type: 'debug' }
  | { type: 'enter_battle'; enemyGroupId: string; triggerPos: { x: number; y: number } }
  | { type: 'enter_camp' }
  | { type: 'exit_camp' }
  | { type: 'start_battle'; enemyGroupId: string }
  | { type: 'exit_battle' }
  | { type: 'replay' }
  | { type: 'exit_to_menu' };

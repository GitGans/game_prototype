import type Phaser from 'phaser';
import type { GamePhase } from '../core/phases';
import type { PhaseSceneSynchronizer } from '../core/phaseSceneSynchronizer';

type GameplaySceneKey =
  | 'MainMenu'
  | 'WorldMap'
  | 'Prep'
  | 'Game'
  | 'BattleResults'
  | 'EquipScreen'
  | 'DebugLevelSelect'
  | 'UpgradeTreeScreen'
  | 'MapVictory';

const GAME_SCENES: readonly GameplaySceneKey[] = [
  'MainMenu', 'WorldMap', 'Prep', 'Game', 'BattleResults',
  'EquipScreen', 'DebugLevelSelect', 'UpgradeTreeScreen', 'MapVictory',
];

const PHASE_SCENE_KEYS: Record<GamePhase['type'], GameplaySceneKey> = {
  main_menu:           'MainMenu',
  world_map:           'WorldMap',
  battle:               'Game',
  camp:                 'Prep',
  battle_results:       'BattleResults',
  equip_screen:         'EquipScreen',
  debug_equip_screen:   'EquipScreen',
  debug_level_select:   'DebugLevelSelect',
  upgrade_tree:         'UpgradeTreeScreen',
  map_victory:          'MapVictory',
};

export class PhaserSceneSynchronizer implements PhaseSceneSynchronizer {
  constructor(private readonly game: Phaser.Game) {}

  sync(phase: GamePhase): void {
    const nextScene = PHASE_SCENE_KEYS[phase.type];
    const sm = this.game.scene;
    for (const key of GAME_SCENES) {
      if (key !== nextScene && (sm.isActive(key) || sm.isPaused(key))) {
        sm.stop(key);
      }
    }
    sm.start(nextScene);
  }
}

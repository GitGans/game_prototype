import Phaser from 'phaser';
import { Boot }      from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { MainMenu }  from './scenes/MainMenu';
import { WorldMap }  from './scenes/WorldMap';
import { Prep }      from './scenes/Prep';
import { Game }       from './scenes/Game';
import { BattleResults } from './scenes/BattleResults';
import { EquipScreen } from './scenes/EquipScreen';
import { DebugLevelSelect } from './scenes/DebugLevelSelect';
import { UpgradeTreeScreen } from './scenes/UpgradeTreeScreen';
import { MapVictory } from './scenes/MapVictory';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  scene: [Boot, Preloader, MainMenu, WorldMap, Prep, Game, BattleResults, EquipScreen, DebugLevelSelect, UpgradeTreeScreen, MapVictory],
  parent: document.body,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

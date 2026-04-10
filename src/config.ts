import Phaser from 'phaser';
import { Boot }      from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { MainMenu }  from './scenes/MainMenu';
import { Prep }      from './scenes/Prep';
import { Game }      from './scenes/Game';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  resolution: window.devicePixelRatio,
  scene: [Boot, Preloader, MainMenu, Prep, Game],
  parent: document.body,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

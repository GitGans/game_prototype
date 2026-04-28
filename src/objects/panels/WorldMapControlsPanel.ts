import Phaser from 'phaser';
import { Button } from '../../ui/Button';
import { scaled } from '../../ui/layout';

export interface WorldMapControlsPanelConfig {
  scene: Phaser.Scene;
  screenW: number;
  callbacks: {
    onDebugBattle: () => void;
    onOpenCharacters: () => void;
    onExitToMenu: () => void;
  };
}

export class WorldMapControlsPanel {
  constructor({ scene, screenW, callbacks }: WorldMapControlsPanelConfig) {
    new Button({
      scene, x: 80, y: 30, w: 120, h: 36,
      label: 'Debug Battle', style: 'dark',
      onClick: callbacks.onDebugBattle,
    });

    new Button({
      scene,
      x: scaled(70),
      y: scaled(75),
      w: scaled(130),
      h: scaled(36),
      label: 'Characters', style: 'navy',
      onClick: callbacks.onOpenCharacters,
    });

    new Button({
      scene, x: screenW - 90, y: 30, w: 140, h: 36,
      label: 'Main Menu', style: 'danger',
      onClick: callbacks.onExitToMenu,
    });
  }
}

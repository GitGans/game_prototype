import Phaser from 'phaser';
import { UI_THEME } from '../ui/theme';

export interface WorldMapPromptConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
}

export class WorldMapPrompt {
  private readonly text: Phaser.GameObjects.Text;

  constructor({ scene, x, y }: WorldMapPromptConfig) {
    this.text = scene.add
      .text(x, y, '', {
        fontSize: '20px',
        color: UI_THEME.color.value.highlight,
        stroke: UI_THEME.color.text.titleStroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);
  }

  show(text: string): void {
    this.text.setText(text).setVisible(true);
  }

  hide(): void {
    this.text.setVisible(false);
  }
}

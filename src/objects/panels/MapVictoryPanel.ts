import Phaser from 'phaser';
import { Button } from '../../ui/Button';
import { scaled } from '../../ui/layout';
import { UI_THEME, fontSize } from '../../ui/theme';

export interface MapVictoryPanelConfig {
  scene:      Phaser.Scene;
  w:          number;
  h:          number;
  mapId:      string;
  onContinue: () => void;
}

export class MapVictoryPanel {
  constructor(cfg: MapVictoryPanelConfig) {
    const { scene, w, h, mapId, onContinue } = cfg;

    scene.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.victory);

    scene.add.text(w / 2, Math.round(h * 0.3), 'MAP CLEARED', {
      fontSize:        fontSize('h2'),
      color:           UI_THEME.color.value.highlight,
      fontStyle:       'bold',
      stroke:          UI_THEME.color.text.titleStroke,
      strokeThickness: scaled(5),
    }).setOrigin(0.5);

    scene.add.text(w / 2, Math.round(h * 0.42), `All enemies on map "${mapId}" defeated`, {
      fontSize: fontSize('lg'),
      color:    UI_THEME.color.value.muted,
    }).setOrigin(0.5);

    new Button({
      scene,
      x:       w / 2,
      y:       Math.round(h * 0.6),
      w:       scaled(220),
      h:       scaled(52),
      label:   'Return to Menu',
      style:   'navy',
      onClick: onContinue,
    });
  }
}

import Phaser from 'phaser';
import { UI_THEME, fontSize } from '../ui/theme';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import { scaled, rowItemCenterX } from '../ui/layout';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';

export type BattleEndOutcome = 'victory' | 'defeat';

export interface BattleEndOverlayConfig {
  scene:         Phaser.Scene;
  outcome:       BattleEndOutcome;
  isDebugBattle: boolean;
  labels: {
    victoryTitle: string;
    defeatTitle:  string;
    restart:      string;
    exit:         string;
  };
  callbacks: {
    onReplay: () => void;
    onExit:   () => void;
  };
}

export class BattleEndOverlay extends Phaser.GameObjects.Container {
  constructor(cfg: BattleEndOverlayConfig) {
    super(cfg.scene, 0, 0);

    const { scene, outcome, isDebugBattle, labels, callbacks } = cfg;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const isVictory = outcome === 'victory';
    const ot = BATTLE_VISUAL_THEME.endOverlay;

    // Fullscreen dim background — reuses Panel primitive.
    // Panel is not set interactive, preserving the existing non-blocking
    // backdrop behavior. Future ModalPanel can decide whether to block
    // pointer input at that layer.
    this.add(new Panel({
      scene,
      x:         w / 2,
      y:         h / 2,
      width:     w,
      height:    h,
      fill:      UI_THEME.component.overlay.dim,
      fillAlpha: UI_THEME.component.overlay.dimAlpha,
    }));

    // VICTORY! / DEFEAT title
    // fontSize('h1') uses the theme token (52px raw) — no inline scaled() for font size.
    // strokeThickness and offsets use scaled() — these are layout/geometry values, not font sizes.
    this.add(
      scene.add.text(
        w / 2,
        h / 2 - scaled(60),
        isVictory ? labels.victoryTitle : labels.defeatTitle,
        {
          fontSize:        fontSize('h1'),
          color:           isVictory ? ot.titleVictory : ot.titleDefeat,
          fontStyle:       'bold',
          stroke:          ot.titleStroke,
          strokeThickness: scaled(5),
        },
      ).setOrigin(0.5),
    );

    // Buttons
    const btnW     = scaled(180);
    const btnH     = scaled(46);
    const btnY     = h / 2 + scaled(40);
    const btnGap   = scaled(20);
    const showExit = isVictory || isDebugBattle;
    const btnCount = showExit ? 2 : 1;

    // Restart button — style differs by outcome to match original design
    this.add(new Button({
      scene,
      x:       rowItemCenterX(w / 2, btnW, btnGap, btnCount, 0),
      y:       btnY,
      w:       btnW,
      h:       btnH,
      label:   labels.restart,
      style:   isVictory ? 'neutral' : 'navy',
      onClick: callbacks.onReplay,
    }));

    if (showExit) {
      this.add(new Button({
        scene,
        x:       rowItemCenterX(w / 2, btnW, btnGap, btnCount, 1),
        y:       btnY,
        w:       btnW,
        h:       btnH,
        label:   labels.exit,
        style:   'primary',
        onClick: callbacks.onExit,
      }));
    }

    // Single depth on the Container — all children inherit z-order through Phaser's container tree.
    this.setDepth(UI_THEME.depth.overlay);
    scene.add.existing(this);
  }
}

import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { PhaseManager } from '../core/PhaseManager';

const RACES = [
  { label: 'Orcs',   groupId: 'orc_patrol'   },
  { label: 'Demons', groupId: 'demon_patrol'  },
  { label: 'Undead', groupId: 'undead_horde'  },
];

export class EnemyGroupSelector extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const panelW = 200;
    const panelH = RACES.length * 50 + 20;
    this.add(scene.add.rectangle(panelW / 2, panelH / 2, panelW, panelH, 0x222244, 0.95));
    RACES.forEach(({ label, groupId }, i) => {
      this.add(new Button({
        scene, x: panelW / 2, y: 20 + i * 50 + 15, w: 160, h: 38,
        label, style: 'ghost',
        onClick: () => {
          this.destroy();
          PhaseManager.transition({ type: 'start_battle', enemyGroupId: groupId });
        },
      }));
    });
    scene.add.existing(this);
  }
}

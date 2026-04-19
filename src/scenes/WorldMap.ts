import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { GameState } from '../core/GameState';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { canMove, resolveCell, initSubMapState } from '../world/mapLogic';
import { Button } from '../ui/Button';
import {
  SubMapDefinition,
  SubMapState,
  MobEntry,
  PortalEntry,
} from '../world/types';

const CELL = 64;

export class WorldMap extends Phaser.Scene {
  private partyX = 0;
  private partyY = 0;
  private mapId = '';
  private mapDef!: SubMapDefinition;

  private cellRects: Phaser.GameObjects.Rectangle[][] = [];
  private partyMarker!: Phaser.GameObjects.Rectangle;
  private interactPrompt!: Phaser.GameObjects.Text;
  private offsetX = 0;
  private offsetY = 0;
  private moveCooldown = false;

  constructor() {
    super('WorldMap');
  }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'world_map') return;

    this.mapId = phase.mapId;
    this.mapDef = MAP_DEFINITIONS[this.mapId];
    this.partyX = phase.partyPos.x;
    this.partyY = phase.partyPos.y;

    if (!GameState.subMapStates[this.mapId]) {
      GameState.subMapStates[this.mapId] = initSubMapState(this.mapDef);
    }

    const cols = this.mapDef.layout[0].length;
    const rows = this.mapDef.layout.length;
    this.offsetX = (this.scale.width  - cols * CELL) / 2;
    this.offsetY = (this.scale.height - rows * CELL) / 2;

    this.buildGrid();
    this.buildPartyMarker();
    this.buildInteractPrompt();
    this.buildDebugButton();

    this.input.keyboard!.on('keydown', this.handleKey, this);
  }

  private buildGrid(): void {
    const mapState = GameState.subMapStates[this.mapId];
    for (let row = 0; row < this.mapDef.layout.length; row++) {
      this.cellRects[row] = [];
      for (let col = 0; col < this.mapDef.layout[row].length; col++) {
        const color = this.cellColor(col, row, mapState);
        const px = this.offsetX + col * CELL + CELL / 2;
        const py = this.offsetY + row * CELL + CELL / 2;
        const rect = this.add.rectangle(px, py, CELL - 2, CELL - 2, color);
        this.cellRects[row][col] = rect;
      }
    }
  }

  private cellColor(x: number, y: number, mapState: SubMapState): number {
    const cell = this.mapDef.layout[y]?.[x];
    if (cell === 'wall' || cell === 'tree') return 0x555555;
    if (cell === null || cell === undefined) return 0x4a7c3f;

    const key = `${x},${y}`;
    const es = mapState.entityStates[key];
    if (es && !es.alive) return 0x888888;

    switch (cell.type) {
      case 'mob':    return 0xcc3333;
      case 'camp':   return 0xcc9933;
      case 'portal': return 0x3355cc;
      case 'shop':   return 0x9933cc;
      default:       return 0xffffff;
    }
  }

  private buildPartyMarker(): void {
    const px = this.offsetX + this.partyX * CELL + CELL / 2;
    const py = this.offsetY + this.partyY * CELL + CELL / 2;
    this.partyMarker = this.add.rectangle(px, py, CELL - 16, CELL - 16, 0x4488ff).setDepth(1);
  }

  private movePartyMarker(): void {
    const px = this.offsetX + this.partyX * CELL + CELL / 2;
    const py = this.offsetY + this.partyY * CELL + CELL / 2;
    this.partyMarker.setPosition(px, py);
  }

  private buildInteractPrompt(): void {
    this.interactPrompt = this.add
      .text(this.scale.width / 2, this.offsetY - 30, '', {
        fontSize: '20px', color: '#ffdd44', stroke: '#000', strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setVisible(false);
  }

  private showPrompt(text: string): void {
    this.interactPrompt.setText(text).setVisible(true);
  }

  private hidePrompt(): void {
    this.interactPrompt.setVisible(false);
  }

  private buildDebugButton(): void {
    new Button({
      scene: this, x: 80, y: 30, w: 120, h: 36,
      label: "Debug Battle", style: "dark",
      onClick: () => PhaseManager.transition({ type: 'debug' }),
    });

    new Button({
      scene: this, x: this.scale.width - 90, y: 30, w: 140, h: 36,
      label: "Main Menu", style: "danger",
      onClick: () => PhaseManager.transition({ type: 'exit_to_menu' }),
    });
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.moveCooldown) return;

    if (event.key === ' ' || event.key === 'e' || event.key === 'E') {
      this.tryInteract();
      return;
    }

    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft')  dx = -1;
    if (event.key === 'ArrowRight') dx =  1;
    if (event.key === 'ArrowUp')    dy = -1;
    if (event.key === 'ArrowDown')  dy =  1;
    if (dx === 0 && dy === 0) return;

    this.tryMove(this.partyX + dx, this.partyY + dy);
  }

  private tryMove(nx: number, ny: number): void {
    if (!canMove(this.mapDef, nx, ny)) return;

    const mapState = GameState.subMapStates[this.mapId];
    const resolved = resolveCell(this.mapDef, mapState, nx, ny);

    // Check for living mob BEFORE passable guard — resolveCell returns passable:false
    // for living mobs, so an early passable check would make this branch unreachable.
    if (resolved.entity?.type === 'mob') {
      const mobData = resolved.entity.data as MobEntry;
      this.partyX = nx;
      this.partyY = ny;
      this.movePartyMarker();
      PhaseManager.updateWorldMapPos(this.mapId, { x: nx, y: ny });
      PhaseManager.transition({
        type: 'enter_battle',
        enemyGroupId: mobData.enemyGroupId,
        triggerPos: { x: nx, y: ny },
      });
      return;
    }

    if (!resolved.passable) return;

    this.partyX = nx;
    this.partyY = ny;
    this.movePartyMarker();
    PhaseManager.updateWorldMapPos(this.mapId, { x: nx, y: ny });

    if (resolved.entity) {
      if (resolved.entity.triggersOnEnter) {
        this.onEnterEntity(nx, ny, resolved.entity);
      } else {
        const label = resolved.entity.type === 'camp' ? 'Press Space to enter camp'
          : resolved.entity.type === 'shop' ? 'Press Space to enter shop'
          : 'Press Space to interact';
        this.showPrompt(label);
      }
    } else {
      this.hidePrompt();
    }

    this.applyMoveCooldown();
  }

  private tryInteract(): void {
    const mapState = GameState.subMapStates[this.mapId];
    const resolved = resolveCell(this.mapDef, mapState, this.partyX, this.partyY);
    if (!resolved.entity || resolved.entity.triggersOnEnter) return;

    this.hidePrompt();
    switch (resolved.entity.type) {
      case 'camp':
        PhaseManager.transition({ type: 'enter_camp' });
        break;
    }
  }

  private onEnterEntity(
    _x: number,
    _y: number,
    entity: NonNullable<ReturnType<typeof resolveCell>['entity']>,
  ): void {
    if (entity.type === 'portal') {
      const portalData = entity.data as PortalEntry;
      if (!GameState.subMapStates[portalData.targetMapId]) {
        GameState.subMapStates[portalData.targetMapId] =
          initSubMapState(MAP_DEFINITIONS[portalData.targetMapId]);
      }
    }
  }

  private applyMoveCooldown(): void {
    this.moveCooldown = true;
    this.time.delayedCall(150, () => { this.moveCooldown = false; });
  }
}

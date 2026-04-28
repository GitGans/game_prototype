import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { GameState } from '../core/GameState';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { canMove, resolveCell, initSubMapState } from '../world/mapLogic';
import { WORLD_MAP_CELL } from '../ui/theme';
import {
  SubMapDefinition,
  MobEntry,
  PortalEntry,
} from '../world/types';
import { WorldMapControlsPanel } from '../objects/panels/WorldMapControlsPanel';
import { WorldMapPrompt } from '../objects/WorldMapPrompt';
import { resolveWorldMapCellColor } from '../objects/worldMapCellPresentation';

const CELL = 64;

export class WorldMap extends Phaser.Scene {
  private partyX = 0;
  private partyY = 0;
  private mapId = '';
  private mapDef!: SubMapDefinition;

  private cellRects: Phaser.GameObjects.Rectangle[][] = [];
  private partyMarker!: Phaser.GameObjects.Rectangle;
  private prompt!: WorldMapPrompt;
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

    this.prompt = new WorldMapPrompt({
      scene: this,
      x: this.scale.width / 2,
      y: this.offsetY - 30,
    });

    new WorldMapControlsPanel({
      scene: this,
      screenW: this.scale.width,
      callbacks: {
        onDebugBattle:    () => PhaseManager.transition({ type: 'debug' }),
        onOpenCharacters: () => PhaseManager.transition({ type: 'open_equip_screen', unitTemplateId: '' }),
        onExitToMenu:     () => PhaseManager.transition({ type: 'exit_to_menu' }),
      },
    });

    this.input.keyboard!.on('keydown', this.handleKey, this);
  }

  private buildGrid(): void {
    const mapState = GameState.subMapStates[this.mapId];
    for (let row = 0; row < this.mapDef.layout.length; row++) {
      this.cellRects[row] = [];
      for (let col = 0; col < this.mapDef.layout[row].length; col++) {
        const cell = this.mapDef.layout[row][col];
        const key = `${col},${row}`;
        const es = mapState.entityStates[key];
        const color = resolveWorldMapCellColor(cell, es?.alive);
        const px = this.offsetX + col * CELL + CELL / 2;
        const py = this.offsetY + row * CELL + CELL / 2;
        const rect = this.add.rectangle(px, py, CELL - 2, CELL - 2, color);
        this.cellRects[row][col] = rect;
      }
    }
  }

  private buildPartyMarker(): void {
    const px = this.offsetX + this.partyX * CELL + CELL / 2;
    const py = this.offsetY + this.partyY * CELL + CELL / 2;
    this.partyMarker = this.add.rectangle(px, py, CELL - 16, CELL - 16, WORLD_MAP_CELL.party).setDepth(1);
  }

  private movePartyMarker(): void {
    const px = this.offsetX + this.partyX * CELL + CELL / 2;
    const py = this.offsetY + this.partyY * CELL + CELL / 2;
    this.partyMarker.setPosition(px, py);
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
        this.prompt.show(label);
      }
    } else {
      this.prompt.hide();
    }

    this.applyMoveCooldown();
  }

  private tryInteract(): void {
    const mapState = GameState.subMapStates[this.mapId];
    const resolved = resolveCell(this.mapDef, mapState, this.partyX, this.partyY);
    if (!resolved.entity || resolved.entity.triggersOnEnter) return;

    this.prompt.hide();
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

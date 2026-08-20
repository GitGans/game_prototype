import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { canMove, resolveCell } from '../world/mapLogic';
import { WORLD_MAP_VISUAL_THEME } from '../objects/worldMapVisualTheme';
import {
  SubMapDefinition,
  SubMapState,
  MobEntry,
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
  // From the phase snapshot; entityStates only change across scene restarts (battle victory
  // switches away from and back into WorldMap, re-running create() with a fresh snapshot).
  private mapState!: SubMapState;

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
    this.mapState = phase.mapState;

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
    const mapState = this.mapState;
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
    this.partyMarker = this.add.rectangle(px, py, CELL - 16, CELL - 16, WORLD_MAP_VISUAL_THEME.partyMarker).setDepth(1);
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

    const resolved = resolveCell(this.mapDef, this.mapState, nx, ny);

    // Check for living mob BEFORE passable guard — resolveCell returns passable:false
    // for living mobs, so an early passable check would make this branch unreachable.
    if (resolved.entity?.type === 'mob') {
      // Guard before any local mutation, so a blocked encounter cannot desync
      // the marker from CampaignState.world.partyPos. The scene reads one
      // boolean; the party-size rules live in progression/rosterCamp.ts.
      const phase = PhaseManager.getPhase();
      if (phase.type !== 'world_map' || !phase.canStartBattle) {
        this.prompt.show('Party cannot enter battle');
        return;
      }

      const mobData = resolved.entity.data as MobEntry;
      this.partyX = nx;
      this.partyY = ny;
      this.movePartyMarker();
      PhaseManager.transition({ type: 'move_party', partyPos: { x: nx, y: ny } });
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
    PhaseManager.transition({ type: 'move_party', partyPos: { x: nx, y: ny } });

    if (resolved.entity) {
      if (resolved.entity.triggersOnEnter) {
        // Portal entities trigger on enter but navigation is not implemented yet — no-op.
        // (mob, the other triggersOnEnter type, already returned above.)
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
    const resolved = resolveCell(this.mapDef, this.mapState, this.partyX, this.partyY);
    if (!resolved.entity || resolved.entity.triggersOnEnter) return;

    this.prompt.hide();
    switch (resolved.entity.type) {
      case 'camp':
        PhaseManager.transition({ type: 'enter_camp' });
        break;
    }
  }

  private applyMoveCooldown(): void {
    this.moveCooldown = true;
    this.time.delayedCall(150, () => { this.moveCooldown = false; });
  }
}

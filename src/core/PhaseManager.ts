import Phaser from 'phaser';
import { GamePhase, PhaseAction } from './phases';
import { GameState } from './GameState';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/unitDefinitions';
import { initSubMapState } from '../world/mapLogic';
import { SubMapDefinition, SubMapState } from '../world/types';

class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private game!: Phaser.Game;

  init(game: Phaser.Game): void {
    this.game = game;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  transition(action: PhaseAction): void {
    const next = resolveTransition(this.phase, action);
    if (next === this.phase) return;

    this.applyActionSideEffects(action, this.phase);
    this.phase = next;
    this.syncPhaserScenes(next);
  }

  // All GameState mutations triggered by phase transitions live here.
  private applyActionSideEffects(action: PhaseAction, prev: GamePhase): void {
    if (action.type === 'start_battle' || action.type === 'enter_battle') {
      GameState.lastEnemyPlacements = null;
    }

    if (action.type === 'play') {
      const mapId = 'test_01';
      if (!GameState.subMapStates[mapId]) {
        GameState.subMapStates[mapId] = initSubMapState(MAP_DEFINITIONS[mapId]);
      }
      if (GameState.playerBenchIds === null) {
        GameState.playerBenchIds = [];
        GameState.campUnitIds = PLAYER_UNITS.slice(9).map(u => u.templateId);
      }
    }

    if (action.type === 'exit_battle' && prev.type === 'battle') {
      if (prev.mapId && prev.triggerPos) {
        const key = `${prev.triggerPos.x},${prev.triggerPos.y}`;
        const mapState = GameState.subMapStates[prev.mapId];
        if (mapState) {
          mapState.entityStates[key] = { alive: false };
        }
      }
      if (prev.mapId) {
        const mapDef = MAP_DEFINITIONS[prev.mapId];
        const mapState = GameState.subMapStates[prev.mapId];
        if (mapDef && mapState && allMobsDead(mapDef, mapState)) {
          (prev as any).returnPhase = { type: 'map_victory', mapId: prev.mapId };
        }
      }
    }
  }

  // Mutates the world_map phase position without triggering a scene switch.
  updateWorldMapPos(mapId: string, pos: { x: number; y: number }): void {
    if (this.phase.type === 'world_map') {
      this.phase = { type: 'world_map', mapId, partyPos: pos };
    }
  }

  private readonly GAME_SCENES = ['MainMenu', 'WorldMap', 'Prep', 'Game', 'MapVictory'];

  private syncPhaserScenes(phase: GamePhase): void {
    const sm = this.game.scene;
    let nextScene: string;
    switch (phase.type) {
      case 'main_menu':  nextScene = 'MainMenu'; break;
      case 'world_map':  nextScene = 'WorldMap'; break;
      case 'battle':     nextScene = 'Game';     break;
      case 'camp':        nextScene = 'Prep';        break;
      case 'debug_prep':  nextScene = 'Prep';        break;
      case 'map_victory': nextScene = 'MapVictory';  break;
      default: return;
    }
    for (const key of this.GAME_SCENES) {
      if (key !== nextScene && (sm.isActive(key) || sm.isPaused(key))) {
        sm.stop(key);
      }
    }
    sm.start(nextScene);
  }
}

// Pure function — no Phaser imports, no GameState access.
// Exported for unit testing.
export function resolveTransition(current: GamePhase, action: PhaseAction): GamePhase {
  switch (action.type) {

    case 'play':
      return {
        type: 'world_map',
        mapId: 'test_01',
        partyPos: MAP_DEFINITIONS['test_01'].startPos,
      };

    case 'debug':
      return { type: 'debug_prep' };

    case 'enter_battle': {
      if (current.type !== 'world_map') return current;
      return {
        type: 'battle',
        enemyGroupId: action.enemyGroupId,
        returnPhase: current,
        triggerPos: action.triggerPos,
        mapId: current.mapId,
      };
    }

    case 'enter_camp': {
      if (current.type !== 'world_map') return current;
      return { type: 'camp', returnPhase: current };
    }

    case 'exit_camp': {
      if (current.type !== 'camp') return current;
      return current.returnPhase;
    }

    case 'start_battle': {
      if (current.type !== 'debug_prep') return current;
      return {
        type: 'battle',
        enemyGroupId: action.enemyGroupId,
        returnPhase: { type: 'main_menu' },
      };
    }

    case 'exit_battle': {
      if (current.type !== 'battle') return current;
      return current.returnPhase;
    }

    case 'replay': {
      if (current.type !== 'battle') return current;
      return { ...current };
    }

    case 'exit_to_menu':
      return { type: 'main_menu' };
  }

  return current;
}

function allMobsDead(mapDef: SubMapDefinition, mapState: SubMapState): boolean {
  for (let row = 0; row < mapDef.layout.length; row++) {
    for (let col = 0; col < mapDef.layout[row].length; col++) {
      const cell = mapDef.layout[row][col];
      if (cell && typeof cell === 'object' && cell.type === 'mob') {
        const key = `${col},${row}`;
        if (mapState.entityStates[key]?.alive !== false) return false;
      }
    }
  }
  return true;
}

export const PhaseManager = new PhaseManagerClass();

import { BattleState, BattleMode, Phase, UnitRace, CellCoord, ItemInstance, ItemContainer } from '../battle/types';
import { buildOccupancy } from '../battle/occupancy';
import { PLAYER_UNITS } from '../data/unitDefinitions';

function emptyState(): BattleState {
  return {
    units: new Map(),
    occupancy: buildOccupancy(new Map()),
    roundQueue: [],
    phase: 'placement',
    validTargets: [],
    benchUnits: [],
  };
}

class GameStateManager {
  private state: BattleState = emptyState();
  private battleMode: BattleMode = 'manual';

  // Survive reset() — shared across scene restarts
  playerUnitLevels: Record<string, number> = {};  // templateId → level
  lastEnemyRace: UnitRace | null = null;          // race from last battle (for Replay)
  playerUnitPlacements: Record<string, CellCoord> = {};  // templateId → anchor, survives reset()
  playerBenchIds: string[] | null = null;               // templateIds on bench; null = first battle, use defaults
  campUnitIds: string[] = [];                            // templateIds of units in camp (fully excluded from battle)
  itemInstances: Record<string, ItemInstance> = {};      // all item instances in the world
  itemContainers: Record<string, ItemContainer> = {};    // all item containers (backpacks, equipment slots)

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = 'manual';
    // playerUnitLevels and lastEnemyRace are intentionally NOT cleared here
  }

  setPhase(phase: Phase): void {
    this.state = { ...this.state, phase };
  }

  getBattleMode(): BattleMode {
    return this.battleMode;
  }

  setBattleMode(mode: BattleMode): void {
    this.battleMode = mode;
  }

  initItemsIfNeeded(): void {
    // Idempotent — safe to call multiple times
    if (Object.keys(this.itemContainers).length > 0) return;

    // Create backpack + equipment containers for every player unit
    for (const bp of PLAYER_UNITS) {
      const tid = bp.templateId;
      this.itemContainers[`backpack_${tid}`] = {
        id: `backpack_${tid}`,
        kind: 'backpack',
        ownerTemplateId: tid,
        slots: {},
      };
      this.itemContainers[`equip_${tid}`] = {
        id: `equip_${tid}`,
        kind: 'equipment',
        ownerTemplateId: tid,
        slots: {},
      };
    }

    // Place starting items (hardcoded for prototype)
    let counter = 1;
    const addToBackpack = (templateId: string, slotKey: string, definitionId: string) => {
      const id = `item_${String(counter++).padStart(3, '0')}`;
      this.itemInstances[id] = { id, definitionId };
      this.itemContainers[`backpack_${templateId}`].slots[slotKey] = id;
    };

    addToBackpack('tank',      '0', 'wooden_ring');
    addToBackpack('tank',      '1', 'iron_ring');
    addToBackpack('dd_medium', '0', 'battle_charm');
  }
}

export const GameState = new GameStateManager();

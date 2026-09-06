import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { PhaserSceneSynchronizer } from "../../src/scenes/phaserSceneSynchronizer";
import type { GamePhase } from "../../src/core/phases";

function fakeGame() {
  const active = new Set<string>();
  const paused = new Set<string>();
  const scene = {
    isActive: vi.fn((key: string) => active.has(key)),
    isPaused: vi.fn((key: string) => paused.has(key)),
    stop: vi.fn((key: string) => {
      active.delete(key);
      paused.delete(key);
    }),
    start: vi.fn((key: string) => {
      active.add(key);
    }),
  };
  return { game: { scene } as unknown as Phaser.Game, scene, active, paused };
}

const PHASE_TO_SCENE: Record<GamePhase["type"], string> = {
  main_menu: "MainMenu",
  world_map: "WorldMap",
  battle: "Game",
  camp: "Prep",
  battle_results: "BattleResults",
  equip_screen: "EquipScreen",
  debug_equip_screen: "EquipScreen",
  debug_level_select: "DebugLevelSelect",
  upgrade_tree: "UpgradeTreeScreen",
  map_victory: "MapVictory",
};

describe("PhaserSceneSynchronizer", () => {
  for (const [type, sceneKey] of Object.entries(PHASE_TO_SCENE)) {
    it(`maps phase "${type}" to scene "${sceneKey}"`, () => {
      const { game, scene } = fakeGame();
      const synchronizer = new PhaserSceneSynchronizer(game);

      synchronizer.sync({ type } as GamePhase);

      expect(scene.start).toHaveBeenCalledWith(sceneKey);
    });
  }

  it("stops active or paused non-target gameplay scenes and starts the target", () => {
    const { game, scene, active, paused } = fakeGame();
    active.add("WorldMap");
    paused.add("Prep");
    const synchronizer = new PhaserSceneSynchronizer(game);

    synchronizer.sync({ type: "battle" } as GamePhase);

    expect(scene.stop).toHaveBeenCalledWith("WorldMap");
    expect(scene.stop).toHaveBeenCalledWith("Prep");
    expect(scene.stop).not.toHaveBeenCalledWith("Game");
    expect(scene.start).toHaveBeenCalledWith("Game");
  });
});

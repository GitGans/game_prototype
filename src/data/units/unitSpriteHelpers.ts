import type { SpriteSheetConfig, SpriteState } from "../../shared/unitTypes";

const PLAYER_UNIT_FRAME_WIDTH = 128;
const PLAYER_UNIT_FRAME_HEIGHT = 128;

const PLAYER_UNIT_SPRITE_STATES = [
  "idle",
  "attack",
  "death",
] satisfies SpriteState[];

const PLAYER_UNIT_SPRITE_BASE_PATH = "assets/sprites/units/player/";

export function playerUnitSprite(filename: string): SpriteSheetConfig {
  return {
    path: PLAYER_UNIT_SPRITE_BASE_PATH + filename,
    frameWidth: PLAYER_UNIT_FRAME_WIDTH,
    frameHeight: PLAYER_UNIT_FRAME_HEIGHT,
    states: PLAYER_UNIT_SPRITE_STATES,
  };
}

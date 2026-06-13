import type { SpriteSheetConfig, SpriteState, UnitRace, UnitBlueprint, UnitUpgradeOption } from '../shared/unitTypes';
import type { ResolvedUnitProgression } from '../progression/progressionTypes';
import { ENEMY_UNITS } from '../data/units';

const UNIT_FRAME_WIDTH  = 128;
const UNIT_FRAME_HEIGHT = 128;
const UNIT_SPRITE_STATES = ['idle', 'attack', 'death'] satisfies SpriteState[];

export function getPlayerUnitSpriteSheet(filename: string): SpriteSheetConfig {
  return {
    path: `assets/sprites/units/player/${filename}`,
    frameWidth:  UNIT_FRAME_WIDTH,
    frameHeight: UNIT_FRAME_HEIGHT,
    states:      UNIT_SPRITE_STATES,
  };
}

export function getEnemyUnitSpriteSheet(race: UnitRace, filename: string): SpriteSheetConfig {
  return {
    path: `assets/sprites/units/enemy/${race}/${filename}`,
    frameWidth:  UNIT_FRAME_WIDTH,
    frameHeight: UNIT_FRAME_HEIGHT,
    states:      UNIT_SPRITE_STATES,
  };
}

// progression.spriteFilename takes priority over blueprint (upgrade sprite overrides base)
export function resolvePlayerUnitSpriteSheet(
  blueprint:   UnitBlueprint,
  progression: ResolvedUnitProgression,
): SpriteSheetConfig | undefined {
  const filename = progression.spriteFilename ?? blueprint.spriteFilename;
  return filename ? getPlayerUnitSpriteSheet(filename) : undefined;
}

// reads the option-level UNIT SPRITE OVERRIDE (not a skill icon)
export function resolvePlayerUpgradeSpriteSheet(
  option: UnitUpgradeOption,
): SpriteSheetConfig | undefined {
  return option.unitSpriteFilename
    ? getPlayerUnitSpriteSheet(option.unitSpriteFilename)
    : undefined;
}

export function findEnemyUnitBlueprintWithRace(
  templateId: string,
): { blueprint: UnitBlueprint; race: UnitRace } | undefined {
  for (const [race, units] of Object.entries(ENEMY_UNITS)) {
    const blueprint = units.find(u => u.templateId === templateId);
    if (blueprint) return { blueprint, race: race as UnitRace };
  }
  return undefined;
}

import type { Unit } from "../../../src/battle/types";
import { ucid }      from "../../../src/shared/unitTypes";
import { testStrike } from "./skills";

let nextId = 1;

export function resetUnitIdCounter(): void {
  nextId = 1;
}

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  const base = {
    id:                   `unit-${nextId++}`,
    name:                 "Test Unit",
    hp:                   100,
    maxHp:                100,
    lifeState:            'alive' as const,
    physicalStrength:     20,
    magicalStrength:      10,
    physicalDefense:      0,
    magicalDefense:       0,
    dodge:                0,
    block:                0,
    level:                1,
    classId:              ucid("warrior"),
    initiative:           10,
    shape:                { offsets: [{ dr: 0, dc: 0 }] },
    side:                 'player' as const,
    skills:               [testStrike],
    activeSkillIndex:     0,
    rowTrait:             "front" as const,
    templateId:           "test",
    activeEffects:        [],
    activatableAbilities: [],
    ...overrides,
  };
  return {
    ...base,
    // Default the color baseline to mirror the unit's own stats (no equipment delta),
    // so existing tests stay neutral. Color-specific tests pass an explicit override.
    statHighlightBaseStats: overrides.statHighlightBaseStats ?? {
      hp:               base.maxHp,
      physicalStrength: base.physicalStrength,
      magicalStrength:  base.magicalStrength,
      physicalDefense:  base.physicalDefense,
      magicalDefense:   base.magicalDefense,
      dodge:            base.dodge,
      block:            base.block,
      initiative:       base.initiative,
    },
  };
}

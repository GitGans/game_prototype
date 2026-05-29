import type { Unit } from "../../../src/battle/types";
import { ucid }      from "../../../src/shared/unitTypes";
import { testStrike } from "./skills";

let nextId = 1;

export function resetUnitIdCounter(): void {
  nextId = 1;
}

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id:                   `unit-${nextId++}`,
    name:                 "Test Unit",
    hp:                   100,
    maxHp:                100,
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
    side:                 'player',
    skills:               [testStrike],
    activeSkillIndex:     0,
    rowTrait:             "front",
    templateId:           "test",
    activeEffects:        [],
    activatableAbilities: [],
    ...overrides,
  };
}

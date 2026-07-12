import { describe, it, expect } from 'vitest';
import { buildPlayerAutoPlacementCandidates } from '../../src/core/battleSetupProjection';
import type { PlayerBattleSetup } from '../../src/core/battleSetup';
import type { PlayerUnitState } from '../../src/progression';
import type { UnitBlueprint, UnitClassId } from '../../src/shared/unitTypes';
import type { SkillId } from '../../src/shared/skillDefinitionTypes';
import { ucid } from '../../src/shared/unitTypes';
import { SHAPES } from '../../src/data/shapeDefinitions';

// resolveUnitProgression performs global SKILLS / UNIT_CLASS_DEFINITIONS lookups
// inside buildPlayerAutoPlacementCandidates, so synthetic blueprints must use
// real, valid baseClassId and baseSkillId. Everything else is controlled.
const realBaseClassId: UnitClassId = ucid('soldier');
const realBaseSkillId: SkillId     = 'p_melee_basic' as SkillId;

function makeBlueprint(templateId: string, hp: number): UnitBlueprint {
  return {
    templateId,
    name: templateId,
    baseClassId: realBaseClassId,
    rowTrait: 'front',
    hp,
    physicalStrength: 1, magicalStrength: 0,
    physicalDefense: 0, magicalDefense: 0,
    dodge: 0, block: 0,
    level: 1, initiative: 1,
    shape: SHAPES['1x1'],
    baseSkillId: realBaseSkillId,
    spriteSheet: { path: 'x.png', frameWidth: 32, frameHeight: 32, states: ['idle', 'attack', 'death'] },
    upgradeTiers: [],
  };
}

const ALICE = makeBlueprint('test_alice', 50);
const BOB   = makeBlueprint('test_bob',   50);
const CARA  = makeBlueprint('test_cara',  50);
const ROSTER = [ALICE, BOB, CARA];

function makeSetup(
  blueprints: readonly UnitBlueprint[],
  overrides: Record<string, Partial<PlayerUnitState>> = {},
): PlayerBattleSetup {
  const playerUnits: Record<string, PlayerUnitState> = {};
  for (const bp of blueprints) {
    playerUnits[bp.templateId] = {
      level: bp.level,
      isInCamp: false,
      lastPlacement: null,
      permanentBonuses: {},
      chosenUpgrades: {},
      lifeState: 'alive',
      currentHp: null,
      ...(overrides[bp.templateId] ?? {}),
    };
  }
  return { playerUnits, itemContainers: {}, itemInstances: {} };
}

describe('buildPlayerAutoPlacementCandidates — dead-unit filter', () => {
  it('persistent dead player unit is excluded', () => {
    const setup = makeSetup(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const ids = buildPlayerAutoPlacementCandidates(setup, ROSTER).map(c => c.templateId);
    expect(ids).not.toContain(ALICE.templateId);
    expect(ids).toContain(BOB.templateId);
    expect(ids).toContain(CARA.templateId);
  });

  it('dead unit with lastPlacement is still excluded', () => {
    const setup = makeSetup(ROSTER, {
      [ALICE.templateId]: {
        lifeState: 'dead',
        currentHp: 0,
        lastPlacement: { side: 'player', row: 0, col: 0 },
      },
    });
    const ids = buildPlayerAutoPlacementCandidates(setup, ROSTER).map(c => c.templateId);
    expect(ids).not.toContain(ALICE.templateId);
  });

  it('camp unit is excluded', () => {
    const setup = makeSetup(ROSTER, { [BOB.templateId]: { isInCamp: true } });
    const ids = buildPlayerAutoPlacementCandidates(setup, ROSTER).map(c => c.templateId);
    expect(ids).not.toContain(BOB.templateId);
    expect(ids).toContain(ALICE.templateId);
  });

  it('alive currentHp: null enters at full maxHp', () => {
    const setup = makeSetup(ROSTER);
    const candidate = buildPlayerAutoPlacementCandidates(setup, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
  });

  it('alive concrete currentHp is applied', () => {
    const setup = makeSetup(ROSTER, { [ALICE.templateId]: { currentHp: 7 } });
    const candidate = buildPlayerAutoPlacementCandidates(setup, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(7);
    expect(unit.maxHp).toBe(50);
  });

  it('currentHp above max is clamped down', () => {
    const setup = makeSetup(ROSTER, { [ALICE.templateId]: { currentHp: 9999 } });
    const candidate = buildPlayerAutoPlacementCandidates(setup, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
    expect(unit.maxHp).toBe(50);
  });
});

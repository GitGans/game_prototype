import { describe, it, expect } from 'vitest';
import { projectPlayerBattleSetup } from '../../src/core/battleSetupProjection';
import type { PlayerSessionState } from '../../src/core/playerSessionState';
import type { PlayerUnitState } from '../../src/progression';
import type { UnitBlueprint, UnitClassId } from '../../src/shared/unitTypes';
import type { SkillId } from '../../src/shared/skillDefinitionTypes';
import { ucid } from '../../src/shared/unitTypes';
import { SHAPES } from '../../src/data/shapeDefinitions';

// resolveUnitProgression performs global SKILLS / UNIT_CLASS_DEFINITIONS lookups
// inside projectPlayerBattleSetup, so synthetic blueprints must use real, valid
// baseClassId and baseSkillId. Everything else is controlled.
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

function makeSession(
  blueprints: readonly UnitBlueprint[],
  overrides: Record<string, Partial<PlayerUnitState>> = {},
): PlayerSessionState {
  const units: Record<string, PlayerUnitState> = {};
  for (const bp of blueprints) {
    units[bp.templateId] = {
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
  return { roster: { units }, inventory: { instances: {}, containers: {} } };
}

describe('projectPlayerBattleSetup — selection', () => {
  it('includes a persistent dead unit that is outside camp', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const ids = projectPlayerBattleSetup(session, ROSTER).map(c => c.templateId);
    expect(ids).toEqual([ALICE.templateId, BOB.templateId, CARA.templateId]);
  });

  it('excludes a dead unit that is in camp', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0, isInCamp: true },
    });
    const ids = projectPlayerBattleSetup(session, ROSTER).map(c => c.templateId);
    expect(ids).not.toContain(ALICE.templateId);
  });

  it('excludes an alive unit that is in camp', () => {
    const session = makeSession(ROSTER, { [BOB.templateId]: { isInCamp: true } });
    const ids = projectPlayerBattleSetup(session, ROSTER).map(c => c.templateId);
    expect(ids).not.toContain(BOB.templateId);
    expect(ids).toContain(ALICE.templateId);
  });

  it('skips a blueprint with no roster record', () => {
    const session = makeSession([ALICE, BOB]); // CARA has no record
    const ids = projectPlayerBattleSetup(session, ROSTER).map(c => c.templateId);
    expect(ids).toEqual([ALICE.templateId, BOB.templateId]);
  });

  it('carries the persistent life state onto the candidate', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const candidates = projectPlayerBattleSetup(session, ROSTER);
    expect(candidates.find(c => c.templateId === ALICE.templateId)!.initialLifeState).toBe('dead');
    expect(candidates.find(c => c.templateId === BOB.templateId)!.initialLifeState).toBe('alive');
  });

  it('preserves lastPlacement as savedAnchor for a dead unit', () => {
    const anchor = { side: 'player', row: 0, col: 2 } as const;
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0, lastPlacement: anchor },
    });
    const candidate = projectPlayerBattleSetup(session, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    expect(candidate.savedAnchor).toEqual(anchor);
  });
});

describe('projectPlayerBattleSetup — runtime unit creation', () => {
  it('a dead candidate creates a canonical dead runtime unit', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const candidate = projectPlayerBattleSetup(session, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    const unit = candidate.createUnit('u1');

    expect(unit.lifeState).toBe('dead');
    expect(unit.hp).toBe(0);
    expect(unit.activeEffects).toEqual([]);
  });

  it('a dead candidate retains full resolved combat data', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const candidates = projectPlayerBattleSetup(session, ROSTER);
    const dead  = candidates.find(c => c.templateId === ALICE.templateId)!.createUnit('u1');
    const alive = candidates.find(c => c.templateId === BOB.templateId)!.createUnit('u2');

    // Everything except hp/lifeState is resolved identically for alive and dead.
    expect(dead.maxHp).toBe(alive.maxHp);
    expect(dead.physicalStrength).toBe(alive.physicalStrength);
    expect(dead.magicalStrength).toBe(alive.magicalStrength);
    expect(dead.physicalDefense).toBe(alive.physicalDefense);
    expect(dead.magicalDefense).toBe(alive.magicalDefense);
    expect(dead.initiative).toBe(alive.initiative);
    expect(dead.classId).toBe(alive.classId);
    expect(dead.shape).toEqual(alive.shape);
    expect(dead.rowTrait).toBe(alive.rowTrait);
    expect(dead.skills.map(s => s.id)).toEqual(alive.skills.map(s => s.id));
    expect(dead.spriteSheet).toEqual(alive.spriteSheet);
    expect(dead.statHighlightBaseStats).toEqual(alive.statHighlightBaseStats);
  });

  it('alive currentHp: null enters at full maxHp', () => {
    const session = makeSession(ROSTER);
    const candidate = projectPlayerBattleSetup(session, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!;
    const unit = candidate.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
  });

  it('alive concrete currentHp is applied', () => {
    const session = makeSession(ROSTER, { [ALICE.templateId]: { currentHp: 7 } });
    const unit = projectPlayerBattleSetup(session, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!.createUnit('u1');
    expect(unit.hp).toBe(7);
    expect(unit.maxHp).toBe(50);
  });

  it('currentHp above max is clamped down', () => {
    const session = makeSession(ROSTER, { [ALICE.templateId]: { currentHp: 9999 } });
    const unit = projectPlayerBattleSetup(session, ROSTER)
      .find(c => c.templateId === ALICE.templateId)!.createUnit('u1');
    expect(unit.hp).toBe(unit.maxHp);
    expect(unit.maxHp).toBe(50);
  });
});

describe('projectPlayerBattleSetup — purity', () => {
  it('does not mutate the input session', () => {
    const session = makeSession(ROSTER, {
      [ALICE.templateId]: { lifeState: 'dead', currentHp: 0 },
    });
    const before = JSON.parse(JSON.stringify(session));
    const candidates = projectPlayerBattleSetup(session, ROSTER);
    candidates.forEach((c, i) => c.createUnit(`u${i}`));
    expect(JSON.parse(JSON.stringify(session))).toEqual(before);
  });
});

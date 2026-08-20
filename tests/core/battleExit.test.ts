import { describe, it, expect } from 'vitest';
import { applyBattleResult } from '../../src/core/battleExit';
import { buildBattleResultsSnapshot } from '../../src/core/battleResultsSnapshot';
import type { PlayerSessionState } from '../../src/core/playerSessionState';
import type { BattleParticipant } from '../../src/core/battleRuntimeContext';
import type { BattleResultParticipantSeed } from '../../src/core/phases';
import type { PlayerUnitState } from '../../src/progression';
import type { UnitBlueprint, UnitClassId } from '../../src/shared/unitTypes';
import type { SkillId } from '../../src/shared/skillDefinitionTypes';
import { ucid } from '../../src/shared/unitTypes';
import { SHAPES } from '../../src/data/shapeDefinitions';
import { makeUnit } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';

// resolveUnitProgression performs global SKILLS / UNIT_CLASS_DEFINITIONS lookups inside
// resolvePlayerMaxHpForLevel, so synthetic blueprints need real baseClassId/baseSkillId.
const realBaseClassId: UnitClassId = ucid('soldier');
const realBaseSkillId: SkillId     = 'p_melee_basic' as SkillId;

function blueprint(templateId: string): UnitBlueprint {
  return {
    templateId,
    name: templateId,
    baseClassId: realBaseClassId,
    rowTrait: 'front',
    hp: 50,
    physicalStrength: 1, magicalStrength: 0,
    physicalDefense: 0, magicalDefense: 0,
    dodge: 0, block: 0,
    level: 1, initiative: 1,
    shape: SHAPES['1x1'],
    baseSkillId: realBaseSkillId,
    upgradeTiers: [],
  };
}

const HERO    = 'test_hero';      // field, injured survivor
const CORPSE  = 'test_corpse';    // field, died in battle
const BENCHED = 'test_benched';   // bench, untouched
const CAMPER  = 'test_camper';    // in camp — never a participant
const RESERVE = 'test_reserve';   // outside the battle entirely

const BLUEPRINTS = [HERO, CORPSE, BENCHED, CAMPER, RESERVE].map(blueprint);

const BENCH_ANCHOR  = coord('player', 0, 2);   // benched unit's previous placement
const HERO_ANCHOR   = coord('player', 0, 0);
const CORPSE_ANCHOR = coord('player', 1, 1);
const STALE_ANCHOR  = coord('player', 2, 0);   // corpse's placement before this battle

function unitState(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: 'alive',
    currentHp: null,
    ...overrides,
  };
}

function makeSession(equipRingOnHero = false): PlayerSessionState {
  return {
    roster: {
      units: {
        [HERO]:    unitState({ level: 3 }),
        [CORPSE]:  unitState({ level: 2, lastPlacement: { ...STALE_ANCHOR } }),
        [BENCHED]: unitState({ level: 4, lastPlacement: { ...BENCH_ANCHOR } }),
        [CAMPER]:  unitState({ level: 7, isInCamp: true }),
        [RESERVE]: unitState({ level: 5 }),
      },
    },
    inventory: {
      instances: equipRingOnHero ? { i1: { id: 'i1', definitionId: 'bronze_ring' } } : {},
      containers: equipRingOnHero
        ? {
            [`equip_${HERO}`]: {
              id: `equip_${HERO}`,
              kind: 'equipment',
              ownerTemplateId: HERO,
              slots: { ring_1: 'i1' },
            },
          }
        : {},
    },
  };
}

const participant = (templateId: string, wasOnBench: boolean): BattleParticipant => ({
  templateId,
  name: templateId,
  level: 99,        // battle-start snapshot — deliberately wrong, must never be persisted
  isAlive: true,    // ditto
  wasOnBench,
  spriteKey: null,
});

const PARTICIPANTS = [
  participant(HERO,    false),
  participant(CORPSE,  false),
  participant(BENCHED, true),
];

/**
 * Runtime at the moment of exit:
 *  - HERO   survived on the field, badly injured (hp far above any resolved max HP, so
 *           the level-up clamp is observable);
 *  - CORPSE died on the field, at an anchor different from its stored one;
 *  - BENCHED never left the bench at full HP.
 */
function makeRuntime() {
  const state = makeBattleStateFromUnits({
    field: [
      { unit: makeUnit({ id: 'u1', side: 'player', templateId: HERO, hp: 999, maxHp: 1000 }),
        anchor: HERO_ANCHOR },
      { unit: makeUnit({ id: 'u2', side: 'player', templateId: CORPSE, hp: 0, maxHp: 50, lifeState: 'dead' }),
        anchor: CORPSE_ANCHOR },
      { unit: makeUnit({ id: 'e1', side: 'enemy', templateId: 'orc' }), anchor: coord('enemy', 0, 0) },
    ],
    bench: [
      { unit: makeUnit({ id: 'u3', side: 'player', templateId: BENCHED, hp: 50, maxHp: 50 }), slot: 0 },
    ],
    benchSlotCount: 3,
  });
  return { state, participants: PARTICIPANTS };
}

describe('applyBattleResult — victory with a mixed participant roster', () => {
  const session = makeSession();
  const runtime = makeRuntime();
  const next = applyBattleResult({ runtime, session, outcome: 'victory' }, BLUEPRINTS);

  it('persists the survivor’s actual runtime HP and levels it up', () => {
    expect(next.units[HERO].lifeState).toBe('alive');
    expect(next.units[HERO].level).toBe(4);           // 3 + 1, from the POST-battle roster
    // Injured: a concrete HP value, clamped to the newly resolved max HP — never healed
    // back to null and never taken from the pre-battle roster.
    expect(next.units[HERO].currentHp).not.toBeNull();
    expect(next.units[HERO].currentHp).toBeLessThan(999);
  });

  it('keeps a dead participant dead while still granting the level', () => {
    expect(next.units[CORPSE].lifeState).toBe('dead');
    expect(next.units[CORPSE].currentHp).toBe(0);
    expect(next.units[CORPSE].level).toBe(3);
  });

  it('persists field anchors and preserves the bench participant’s previous placement', () => {
    expect(next.units[HERO].lastPlacement).toEqual(HERO_ANCHOR);
    expect(next.units[CORPSE].lastPlacement).toEqual(CORPSE_ANCHOR);   // replaces STALE_ANCHOR
    expect(next.units[BENCHED].lastPlacement).toEqual(BENCH_ANCHOR);   // untouched
  });

  it('copies persisted anchors rather than aliasing runtime coordinates', () => {
    const deployment = runtime.state.deployments.get('u1');
    if (deployment?.kind !== 'field') throw new Error('test setup invariant');
    expect(next.units[HERO].lastPlacement).not.toBe(deployment.anchor);
  });

  it('levels the bench participant exactly once', () => {
    expect(next.units[BENCHED].level).toBe(5);
    expect(next.units[BENCHED].lifeState).toBe('alive');
    expect(next.units[BENCHED].currentHp).toBeNull();
  });

  it('leaves nonparticipants — including camp units — untouched', () => {
    expect(next.units[CAMPER]).toBe(session.roster.units[CAMPER]);
    expect(next.units[RESERVE]).toBe(session.roster.units[RESERVE]);
  });

  it('resolves the new max HP from the passed session’s inventory', () => {
    // Both runs clamp the survivor's HP to the newly resolved max, so the +5 hp ring
    // is directly observable in the persisted value.
    const withoutRing = applyBattleResult(
      { runtime: makeRuntime(), session: makeSession(false), outcome: 'victory' }, BLUEPRINTS,
    );
    const withRing = applyBattleResult(
      { runtime: makeRuntime(), session: makeSession(true), outcome: 'victory' }, BLUEPRINTS,
    );
    expect(withRing.units[HERO].currentHp! - withoutRing.units[HERO].currentHp!).toBe(5);
  });

  it('does not mutate the input session or runtime', () => {
    const input   = makeSession();
    const before  = JSON.parse(JSON.stringify(input));
    const rt      = makeRuntime();
    const unitsBefore = new Map(rt.state.units);

    applyBattleResult({ runtime: rt, session: input, outcome: 'victory' }, BLUEPRINTS);

    expect(input).toEqual(before);
    expect(rt.state.units).toEqual(unitsBefore);
    expect(rt.participants).toEqual(PARTICIPANTS);
  });

  it('feeds the result screen from the returned roster, not the participant snapshot', () => {
    const seeds: BattleResultParticipantSeed[] = PARTICIPANTS.map(p => ({
      templateId: p.templateId,
      name:       p.name,
      wasOnBench: p.wasOnBench,
      spriteKey:  p.spriteKey,
    }));
    const cards = buildBattleResultsSnapshot(next, seeds);

    const hero   = cards.find(c => c.templateId === HERO)!;
    const corpse = cards.find(c => c.templateId === CORPSE)!;

    // The participants claim level 99 / alive; the roster is the source of truth.
    expect(hero.newLevel).toBe(4);
    expect(hero.isAlive).toBe(true);
    expect(corpse.newLevel).toBe(3);
    expect(corpse.isAlive).toBe(false);
    expect(corpse.wasOnBench).toBe(false);   // presentation metadata still comes from the seed
  });
});

describe('applyBattleResult — defeat with mixed participant states', () => {
  it('persists HP, life state and placement without granting levels', () => {
    const session = makeSession();
    const runtime = makeRuntime();

    const next = applyBattleResult({ runtime, session, outcome: 'defeat' }, BLUEPRINTS);

    expect(next.units[HERO].lifeState).toBe('alive');
    expect(next.units[HERO].currentHp).toBe(999);      // no level-up clamp on defeat
    expect(next.units[HERO].level).toBe(3);            // unchanged

    expect(next.units[CORPSE].lifeState).toBe('dead');
    expect(next.units[CORPSE].currentHp).toBe(0);
    expect(next.units[CORPSE].level).toBe(2);
    expect(next.units[CORPSE].lastPlacement).toEqual(CORPSE_ANCHOR);

    expect(next.units[BENCHED].level).toBe(4);
    expect(next.units[BENCHED].lastPlacement).toEqual(BENCH_ANCHOR);

    expect(next.units[CAMPER]).toBe(session.roster.units[CAMPER]);
    expect(next.units[RESERVE]).toBe(session.roster.units[RESERVE]);
  });

  it('persists a unit revived during the battle as alive', () => {
    const session = makeSession();
    // The unit entered the battle as a corpse and was revived mid-battle.
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'u1', side: 'player', templateId: HERO, hp: 50, maxHp: 50 }),
          anchor: HERO_ANCHOR },
        { unit: makeUnit({ id: 'u2', side: 'player', templateId: CORPSE, hp: 8, maxHp: 50 }),
          anchor: CORPSE_ANCHOR },
      ],
      bench: [
        { unit: makeUnit({ id: 'u3', side: 'player', templateId: BENCHED, hp: 50, maxHp: 50 }), slot: 0 },
      ],
      benchSlotCount: 3,
    });

    const next = applyBattleResult(
      { runtime: { state, participants: PARTICIPANTS }, session, outcome: 'defeat' }, BLUEPRINTS,
    );

    expect(next.units[CORPSE].lifeState).toBe('alive');
    expect(next.units[CORPSE].currentHp).toBe(8);
    expect(next.units[CORPSE].level).toBe(2);
  });
});

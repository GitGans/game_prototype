import { describe, it, expect } from 'vitest';
import { createBattleRuntimeForSession } from '../../src/core/battleStart';
import { applyBattleResult } from '../../src/core/battleExit';
import type { PlayerSessionState } from '../../src/core/playerSessionState';
import type { PlayerUnitState } from '../../src/progression';
import { resolveSkillTargetsForPolicy } from '../../src/battle/targeting';
import { reviveUnitInBattle } from '../../src/battle/revive';
import { requireFieldDeployment } from '../../src/battle/deployment';
import { canBeginCombat } from '../../src/battle/combatStart';
import { buildRoundQueue } from '../../src/battle/initiative';
import { getLivingFieldUnitEntries } from '../../src/battle/deployment';
import { cellKey } from '../../src/battle/field';
import { PLAYER_UNITS } from '../../src/data/units';
import { fixedRng } from '../battle/helpers/rng';

const [HEALER_BP, CORPSE_BP] = PLAYER_UNITS;

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

function makeSession(): PlayerSessionState {
  return {
    roster: {
      units: {
        [HEALER_BP.templateId]: unitState(),
        [CORPSE_BP.templateId]: unitState({ lifeState: 'dead', currentHp: 0 }),
      },
    },
    inventory: { instances: {}, containers: {} },
  };
}

/**
 * End-to-end: persistent-dead PlayerUnitState → battle projection → dead field
 * runtime unit → dead_friendly target → revive → living runtime unit → exit
 * persistence. Covers only the seams between stages; the revive percentage,
 * effect-area matrices and queue-timing rules have their own tests.
 */
describe('persistent-dead deployment → revive → persistence', () => {
  it('a unit that died in a previous battle can be deployed and resurrected', () => {
    // ── 1. Battle setup includes the persistent-dead unit ──
    const runtime = createBattleRuntimeForSession({
      session: makeSession(),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    const state = runtime.state;
    const corpse = [...state.units.values()]
      .find(u => u.side === 'player' && u.templateId === CORPSE_BP.templateId)!;
    const caster = [...state.units.values()]
      .find(u => u.side === 'player' && u.templateId === HEALER_BP.templateId)!;

    // ── 2. It is a canonical dead runtime unit with a field deployment ──
    expect(corpse.lifeState).toBe('dead');
    expect(corpse.hp).toBe(0);
    const corpseAnchor = requireFieldDeployment(state, corpse.id).anchor;

    // ── 3. Absent from living occupancy, present as a participant ──
    expect(state.occupancy.unitToCells.has(corpse.id)).toBe(false);
    expect(runtime.participants.find(p => p.templateId === CORPSE_BP.templateId)!.isAlive).toBe(false);

    // ── 4. Combat may begin: the living unit holds the field ──
    expect(canBeginCombat(state)).toBe(true);

    // ── 5. dead_friendly targeting finds the corpse ──
    const casterAnchor = requireFieldDeployment(state, caster.id).anchor;
    const targets = resolveSkillTargetsForPolicy({ type: 'dead_friendly' }, state, casterAnchor);
    expect(targets.map(cellKey)).toContain(cellKey(corpseAnchor));

    // ── 6. Revive through the ordinary pipeline ──
    const revived = reviveUnitInBattle(state, corpse.id, { level: 1 })!;
    expect(revived).not.toBeNull();
    const revivedUnit = revived.state.units.get(corpse.id)!;
    expect(revivedUnit.lifeState).toBe('alive');
    expect(revivedUnit.hp).toBeGreaterThan(0);

    // ── 7. It becomes a living blocker but does not join the current round ──
    expect(revived.state.occupancy.unitToCells.has(corpse.id)).toBe(true);
    expect(revived.state.roundQueue).toEqual(state.roundQueue);
    expect(buildRoundQueue(new Map(getLivingFieldUnitEntries(revived.state)))).toContain(corpse.id);

    // ── 8. Battle exit persists it as alive with the restored HP ──
    // Defeat: isolates HP/life/placement persistence from victory level-ups.
    const next = applyBattleResult({
      runtime: { state: revived.state, participants: runtime.participants },
      session: makeSession(),
      outcome: 'defeat',
    }).units;

    const persisted = next[CORPSE_BP.templateId];
    expect(persisted.lifeState).toBe('alive');
    expect(persisted.currentHp).toBe(revivedUnit.hp);
    expect(persisted.lastPlacement).toEqual(corpseAnchor);
  });

  it('a deployed corpse that is never revived stays persistently dead', () => {
    const runtime = createBattleRuntimeForSession({
      session: makeSession(),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    const next = applyBattleResult({
      runtime: { state: runtime.state, participants: runtime.participants },
      session: makeSession(),
      outcome: 'defeat',
    }).units;

    expect(next[CORPSE_BP.templateId].lifeState).toBe('dead');
    expect(next[CORPSE_BP.templateId].currentHp).toBe(0);
    expect(next[HEALER_BP.templateId].lifeState).toBe('alive');
  });
});

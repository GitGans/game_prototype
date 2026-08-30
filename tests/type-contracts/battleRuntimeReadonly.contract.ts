// Compile-time contract for the Stage 4B battle-runtime read boundary.
//
// NOT a runtime test: this file is compiled by
// tests/core/battleRuntimeReadonlyContract.test.ts and is never executed.
//
// Two complementary mechanisms, both load-bearing:
//   1. MutableKeys — exhaustive. Every property of every runtime-owned record must be
//      readonly. Catches a single dropped modifier anywhere, which the assignment
//      statements below cannot: they only pin the handful of properties they name.
//   2. Forbidden operations — representative. Every owned collection kind
//      (ReadonlyMap / readonly T[] / ReadonlySet) must reject in-place mutation.
//      Catches what (1) cannot see: a readonly field holding a mutable value.
//
// Deliberately NOT asserted: the fields of an `ActionSkillDefinition` inside
// `unit.skills`. Those are shared immutable static catalogue entries from the SKILLS
// registry, not battle-runtime-owned data — only the containing array is a
// runtime-owned collection. See the read-gateway bullet in the root CLAUDE.md.
import type { requireBattleRuntimeForPhase } from '../../src/core/battleRuntimeAccess';

type RuntimeRead = ReturnType<typeof requireBattleRuntimeForPhase>;

// ═══ 1. Exhaustive record-property readonly ══════════════════════════════════

// Identity test: `{ [P in K]: T[P] }` and its `-readonly` twin are mutually assignable
// in this deferred-conditional form only when K was already mutable.
type IfEqual<X, Y, Yes = X, No = never> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? Yes : No;

type MutableKeys<T extends object> = {
  [K in keyof T]-?: IfEqual<{ [P in K]: T[P] }, { -readonly [P in K]: T[P] }, K, never>
}[keyof T];

// Distributes over discriminated unions (UnitDeployment, AutoTurnIntention).
type MutableKeysOfUnion<T> = T extends object ? MutableKeys<T> : never;

// Fails as TS2344 — "Type 'X' does not satisfy the constraint 'never'" — naming the
// exact property that lost its readonly modifier.
type ExpectNever<T extends never> = T;

type MapValue<T>   = T extends ReadonlyMap<unknown, infer V> ? V : never;
type ArrayValue<T> = T extends readonly (infer V)[] ? V : never;

// Everything below is derived from the gateway's return type, so these assertions
// track whatever `requireBattleRuntimeForPhase()` actually hands back — not what
// `BattleRuntimeContext` happens to declare.
type RuntimeState           = RuntimeRead['state'];
type RuntimeUnit            = MapValue<RuntimeState['units']>;
type RuntimeEffect          = ArrayValue<RuntimeUnit['activeEffects']>;
type RuntimeParticipant     = ArrayValue<RuntimeRead['participants']>;
type RuntimeReplayPlacement = ArrayValue<RuntimeRead['replaySetup']['enemyPlacements']>;
type RuntimeDeployment      = MapValue<RuntimeState['deployments']>;
type RuntimeCoord           = ArrayValue<RuntimeState['validTargets']>;
type RuntimeIntention       = NonNullable<RuntimeRead['pendingAutoTurnIntention']>;

// Exported so `noUnusedLocals` accepts the aliases above; never instantiated.
export type BattleRuntimeReadonlyRecordContract = [
  ExpectNever<MutableKeysOfUnion<RuntimeRead>>,
  ExpectNever<MutableKeysOfUnion<RuntimeState>>,
  ExpectNever<MutableKeysOfUnion<RuntimeState['occupancy']>>,
  ExpectNever<MutableKeysOfUnion<RuntimeState['placementSelection']>>,
  ExpectNever<MutableKeysOfUnion<RuntimeRead['turnContext']>>,
  ExpectNever<MutableKeysOfUnion<RuntimeUnit>>,
  ExpectNever<MutableKeysOfUnion<RuntimeUnit['shape']>>,
  ExpectNever<MutableKeysOfUnion<ArrayValue<RuntimeUnit['shape']['offsets']>>>,
  ExpectNever<MutableKeysOfUnion<RuntimeUnit['statHighlightBaseStats']>>,
  ExpectNever<MutableKeysOfUnion<NonNullable<RuntimeUnit['spriteSheet']>>>,
  ExpectNever<MutableKeysOfUnion<RuntimeEffect>>,
  ExpectNever<MutableKeysOfUnion<RuntimeEffect['effect']>>,
  ExpectNever<MutableKeysOfUnion<NonNullable<RuntimeEffect['periodicHp']>>>,
  ExpectNever<MutableKeysOfUnion<RuntimeParticipant>>,
  ExpectNever<MutableKeysOfUnion<RuntimeReplayPlacement>>,
  ExpectNever<MutableKeysOfUnion<RuntimeDeployment>>,
  ExpectNever<MutableKeysOfUnion<RuntimeCoord>>,
  ExpectNever<MutableKeysOfUnion<RuntimeIntention>>,
];

// ═══ 2. Representative collection-capability checks ══════════════════════════

declare const runtime: RuntimeRead;
declare const someState: RuntimeState;

// ── container ────────────────────────────────────────────────────────────────
// @ts-expect-error — the read gateway must not expose a writable runtime field
runtime.mode = 'auto';

// @ts-expect-error — the runtime container cannot be replaced through a read
runtime.state = someState;

// @ts-expect-error — runtime-owned arrays are query-only
runtime.participants.pop();

// @ts-expect-error — turn context exposes a query-only set
runtime.turnContext.chargedThisRound.add('p1');

// ── battle state ─────────────────────────────────────────────────────────────
// @ts-expect-error — runtime unit storage is query-only
runtime.state.units.clear();

// @ts-expect-error — queue mutation must require a replacement BattleState
runtime.state.roundQueue.push('p1');

// @ts-expect-error — placement selection is an immutable value
runtime.state.placementSelection.selectedBenchUnitId = 'p1';

// @ts-expect-error — occupancy is query-only
runtime.state.occupancy.cellToUnitId.clear();

// @ts-expect-error — deployment storage is query-only
runtime.state.deployments.clear();

const occupiedCells = runtime.state.occupancy.unitToCells.get('p1');
if (occupiedCells) {
  // @ts-expect-error — occupancy coordinate arrays are immutable
  occupiedCells.pop();
}

const target = runtime.state.validTargets[0];
if (target) {
  // @ts-expect-error — coordinates stored in runtime are immutable values
  target.row = 0;
}

const deployment = runtime.state.deployments.get('p1');
if (deployment && deployment.kind === 'field') {
  // @ts-expect-error — deployment records are immutable values
  deployment.anchor = deployment.anchor;
}

// ── unit and its owned nested values ─────────────────────────────────────────
// `.get()` rather than `.values().next().value`: clearer, and stable across
// lib/iterator typing changes.
const unit = runtime.state.units.get('p1');
if (unit) {
  // @ts-expect-error — a unit obtained from runtime cannot be patched in place
  unit.hp = 0;

  // @ts-expect-error — effects must be replaced, not appended in place
  unit.activeEffects.pop();

  // @ts-expect-error — resolved stat baselines are runtime-owned values
  unit.statHighlightBaseStats.hp = 0;

  // @ts-expect-error — shared SHAPES entries are immutable value contracts
  unit.shape.offsets.pop();

  // @ts-expect-error — the skills array is runtime-owned even though its entries are static
  unit.skills.pop();

  if (unit.spriteSheet) {
    // @ts-expect-error — sprite-state configuration is query-only
    unit.spriteSheet.states.pop();
  }

  const effect = unit.activeEffects[0];
  if (effect) {
    // @ts-expect-error — active effects are immutable
    effect.remainingRounds = 0;

    // @ts-expect-error — nested runtime effect data is immutable
    effect.effect.id = 'changed';

    if (effect.periodicHp) {
      // @ts-expect-error — nested periodic data is immutable
      effect.periodicHp.amountPerTurn = 0;
    }
  }
}

// ── participants, replay setup, pending intention ────────────────────────────
const participant = runtime.participants[0];
if (participant) {
  // @ts-expect-error — participant records are immutable
  participant.level = 2;
}

// @ts-expect-error — replay placements are query-only
runtime.replaySetup.enemyPlacements.pop();

const replayPlacement = runtime.replaySetup.enemyPlacements[0];
if (replayPlacement) {
  // @ts-expect-error — replay records are immutable
  replayPlacement.level = 2;
}

const intention = runtime.pendingAutoTurnIntention;
if (intention) {
  // @ts-expect-error — pending intentions are immutable
  intention.unitId = 'p2';
}

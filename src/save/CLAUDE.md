# save

## Role
Future save/load boundary. Defines the contract a real save implementation will satisfy — no
implementation exists yet.

## Key Files
- `saveTypes.ts` — `SaveRepository { load(saveId): CampaignState; save(saveId, state): void }`.
  Only `CampaignState` crosses this boundary.

## Structural Role
`save/` → contract-only domain, consumed by nothing yet. `core/` is the intended future caller
(save/load orchestration); everything else is blocked from importing it.

## Dependencies
- may import: `src/campaign/` (the `CampaignState` contract), `src/shared/`
- must NOT import: `src/core/`, `src/battle/`, `src/scenes/`, `src/objects/`, `src/ui/`, Phaser
- must NOT be imported by: any layer except `src/core/` (enforced by `scripts/check-boundaries.mjs`
  — every existing blocklist layer bans `save`)

## Invariants
- `SaveRepository` accepts and returns only `CampaignState` — never `DebugBattleState`,
  `BattleRuntimeContext`/`BattleState`, `GamePhase`, `PlayerSessionSource`, `GameState`, or any
  Phaser/scene/UI type
- No disk/browser storage, serialization, migrations, UI, or save actions belong here until a
  later stage introduces them

## Where to Modify
- change the save/load contract → `saveTypes.ts`

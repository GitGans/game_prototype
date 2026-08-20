# campaign

## Role
Persistent campaign state contract. Owns the shape of everything that survives between
sessions — the only future save source.

## Key Files
- `campaignState.ts` — `CampaignState { roster, inventory, world, money }`, JSON-compatible
- `index.ts` — public API barrel

## Structural Role
`campaign/` → persistent state contract only; runtime ownership (the current `CampaignState`
instance) lives in `src/core/GameState.ts`. Initialization is `src/core/initCampaignState.ts`.

## Dependencies
- may import: `src/shared/`, `src/progression/`, `src/inventory/`, `src/world/` (type contracts only)
- must NOT import: `src/battle/`, `src/core/`, `src/scenes/`, `src/objects/`, `src/ui/`

## Invariants
- `CampaignState` must remain plain JSON-compatible data
- No battle runtime, debug state, phase/UI state, or save metadata belongs here
- `roster`/`inventory` reuse the same types debug uses, but campaign and debug never share instances

## Where to Modify
- add/change persistent campaign fields → `campaignState.ts`

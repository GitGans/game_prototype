# objects

## Role
Game-specific visual components that bridge game data and the UI layer. Each component knows game domain types and uses `src/ui/` primitives internally — scenes compose these components rather than building visuals directly.

## Responsibilities
- Render units, cells, and battle state (HP, effects, initiative, log)
- Display tooltips for skills, effects, items, and units
- Manage equipment and inventory slot grids
- Present skill selections during battle and in preparation screens
- Show upgrade cards for the upgrade-selection flow
- Encapsulate hover/click interactions tied to game data

## Key Files

- `UnitView.ts` — unit sprite with HP bar, effect indicators, and buff/debuff tooltips
- `CellView.ts` — grid cell with highlight modes for placement and battle targeting
- `InitiativeBar.ts` — turn-order strip showing current and next round queues
- `BattleLog.ts` — collapsible event log with color-coded entries
- `SkillBar.ts` — vertical skill list for in-battle selection with active/inactive states
- `SkillIconRow.ts` — skill icon strip used in preparation/equip screens
- `SkillCellTooltip.ts` — detailed skill description tooltip (used inside `SkillIconRow`)
- `UnitTooltip.ts` — full unit stat panel with sprite, stats, and skill list
- `EffectTooltip.ts` — buff/debuff description tooltip
- `SkillTooltip.ts` — skill name and damage-type tooltip
- `ItemTooltip.ts` — item stat-bonus and class-restriction tooltip
- `ItemCell.ts` — single equipment/backpack slot with hover and click
- `EquipmentMatrix.ts` — 4×3 grid of equipment slots composed from `ItemCell`
- `BackpackRow.ts` — 10-slot inventory grid composed from `ItemCell`
- `UpgradeCard.ts` — upgrade option card with chosen/available/locked states
- `EnemyGroupSelector.ts` — popup to pick enemy race, calls `PhaseManager.transition()`

## Structural Role
`src/objects/` → game-aware visual components consumed by scenes

## Data Flow
`GamePhase` snapshot data
↓
component receives typed snapshot in constructor or `show()` / `refresh()`
↓
renders via Phaser containers using `src/ui/` primitives and theme constants
↓
fires callbacks (`onClick`, `onSelect`) or calls `PhaseManager.transition()` on interaction

## Dependencies
- depends on: `src/ui/` (buttons, tooltips, BaseTooltip, HpBar, theme), `src/core/` (types, constants), game domain types from `src/data/` and `src/battle/`
- used by: `src/scenes/` — `Game.ts`, `EquipScreen.ts`, `Prep.ts`, `UpgradeTreeScreen.ts`

## Invariants
- Components are stateless renderers — they do not own or mutate `CampaignState` or `BattleState`
- All game data enters through constructor arguments or explicit `show()` / `refresh()` calls
- Hover and click logic lives here, never duplicated inside scenes
- `EnemyGroupSelector` is the only component allowed to call `PhaseManager.transition()` directly; all others fire callbacks
- Tooltip components extend `BaseTooltip` from `src/ui/` — no custom tooltip base classes here

## Where to Modify
- unit rendering (sprite, HP, effects) → `UnitView.ts`
- grid cell highlights or modes → `CellView.ts`
- turn-order display → `InitiativeBar.ts`
- battle log styling or capacity → `BattleLog.ts`
- in-battle skill selection UI → `SkillBar.ts`
- skill icons in equip/prep screens → `SkillIconRow.ts`
- skill tooltip content → `SkillCellTooltip.ts`
- unit stat tooltip → `UnitTooltip.ts`
- buff/debuff tooltip → `EffectTooltip.ts`
- item tooltip → `ItemTooltip.ts`
- single inventory/equipment slot → `ItemCell.ts`
- equipment slot grid layout → `EquipmentMatrix.ts`
- backpack grid layout → `BackpackRow.ts`
- upgrade card states or layout → `UpgradeCard.ts`
- enemy group selection popup → `EnemyGroupSelector.ts`

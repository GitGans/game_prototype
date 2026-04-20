# objects

## Role
Phaser display components for the battle field and inventory UI. All classes are read-only views — they render state snapshots and surface user interactions via callbacks, never mutating `GameState` directly.

## Responsibilities
- Render grid cells, units, and initiative order on the battle screen
- Display inventory and equipment slots during prep
- Show tooltips for items, skills, units, and active effects
- Emit user input (clicks, hovers) through callbacks to scenes
- Refresh visuals in response to state changes forwarded from scenes

## Key Files
- `CellView.ts` — single battle grid cell; handles highlight, hover, and AoE skill preview states
- `UnitView.ts` — unit on the grid: sprite, name, HP bar, buff/debuff indicators with tooltips
- `InitiativeBar.ts` — top-of-screen turn queue showing current round and upcoming units
- `BattleLog.ts` — collapsible log of battle events
- `BackpackRow.ts` — 2×5 inventory slot grid; delegates per-slot rendering to `ItemCell`
- `EquipmentMatrix.ts` — 4×3 equipment slot grid; delegates per-slot rendering to `ItemCell`
- `ItemCell.ts` — single inventory/equipment slot with hover tooltip
- `ItemTooltip.ts` — item name, stats, and class restriction tooltip
- `SkillTooltip.ts` — skill name and damage type tooltip
- `UnitTooltip.ts` — full unit info (stats, skills, HP, sprite); supports hover, fixed, and blueprint-preview modes
- `EffectTooltip.ts` — buff/debuff name, description, and per-turn value tooltip

## Structural Role
`src/objects/` → Phaser view layer; receives data, renders it, forwards input to scenes

## Data Flow
Scene passes state snapshot or unit reference to component
↓
Component builds/refreshes Phaser GameObjects (rects, text, images)
↓
User interacts → callback fires → scene handles it
↓
Scene receives new state → calls refresh on component

## Dependencies
- depends on: `src/battle/types.ts` (domain types), `src/battle/combat.ts` (stat calculations), `src/core/Constants.ts` (layout/color constants), `src/ui/theme.ts` (UI theme)
- used by: `src/scenes/Game.ts`, `src/scenes/Prep.ts`

## Invariants
- Components never import from `src/core/GameState` — all data arrives as constructor arguments or refresh parameters
- Components never call `PhaseManager.transition()` — user input is surfaced via callbacks only
- No game logic lives here — damage formulas, targeting rules, and item operations belong in `src/battle/`
- Tooltips share a common `BaseTooltip` base class; new tooltips must extend it

## Where to Modify
- Change cell highlight or AoE preview → `CellView.ts`
- Change unit HP bar or death visuals → `UnitView.ts`
- Change buff/debuff tooltip display → `EffectTooltip.ts`
- Change initiative bar layout or turn order display → `InitiativeBar.ts`
- Change battle log formatting or collapse behavior → `BattleLog.ts`
- Change inventory slot appearance → `ItemCell.ts`
- Change item tooltip content → `ItemTooltip.ts`
- Change skill tooltip content → `SkillTooltip.ts`
- Change unit info tooltip → `UnitTooltip.ts`
- Change backpack grid layout → `BackpackRow.ts`
- Change equipment slot grid layout → `EquipmentMatrix.ts`

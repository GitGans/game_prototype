# Gameplay Target Plan

Этот документ фиксирует будущую игровую систему и gameplay-инварианты, которые должны сопровождать архитектурный рефакторинг. Его цель — не описать все контентные детали, а сохранить направление разработки, чтобы при рефакторинге не потерять важные решения о кампании, боях, скиллах, сохранениях, debug mode и границах систем.

Документ основан на планируемом gameplay и проверке текущего кода боя, скиллов, targeting и поля боя.

## 1. Общая структура игры

Игра строится вокруг кампании из нескольких карт. Карты соединены порталами. В каждый момент времени активные действия игрока происходят только на одной карте.

Кампания имеет сохраняемый прогресс. Игрок вручную сохраняет игру кнопкой “Сохранить”. Должно поддерживаться до 100 сохраненных игр, которые можно загружать и продолжать с сохраненного состояния.

Сохраняется прогресс кампании между боями. Во время боя сохраняться нельзя.

Основные долгоживущие системы кампании:

```txt
campaign progress
current map
global campaign day
map states
party roster
inactive camp roster state
unit progression
unit HP outside battle
inventory/backpack
equipment
money/resources
shop state
dialogue/cutscene flags
enemy group alive/dead state on maps
```

`GamePhase` не является save source. Он остается render/read model для текущего экрана.

---

## 2. Карты и перемещение

Кампания состоит из нескольких карт, связанных порталами.

На карте есть:

```txt
player party position
camp location/state
enemy groups
shops
loot/events
dialogues
cutscenes
portals to other maps
```

Можно какое-то время ходить по другой карте, затем вернуться. Состояние карты должно сохраниться: убитые enemy groups остаются убитыми, живые остаются живыми.

Для врагов на карте не нужно хранить HP или частичное состояние боя, потому что частичного боя не бывает. Достаточно хранить состояние enemy group:

```txt
alive/dead
position
definition/group id
```

---

## 3. Party, camp и лимиты отряда

В кампании есть player units. В рамках одной линии сохранения каждый persistent player unit существует только в одном экземпляре. Поэтому для player roster допустимо использовать `templateId` как persistent unit identity, но архитектурно нужно помнить различие:

```txt
templateId / definitionId → content definition
playerUnitId → persistent player unit; сейчас равен templateId
battleUnitId → runtime unit id внутри боя
```

На одной карте у игрока может быть от 3 до 12 юнитов.

По карте ходит только один общий отряд. Отряд всегда двигается группой. Нет разделения партии на несколько активных групп.

Camp — это inactive часть общего roster, доступная на любой карте. Это не отдельное per-map хранилище персонажей: юниты, отправленные в camp, остаются частью общего roster, но не входят в активную movement party.

Юнитами в camp нельзя управлять на карте, и они не участвуют в movement party.

Активный отряд на карте может включать максимум 9 юнитов. Если у игрока больше 9 доступных юнитов, лишние отправляются в лагерь.

Camp state должен быть частью campaign state, а не battle state.

---

## 4. Дни и движение по карте

Перемещение по карте идет по дням.

День глобальный для всей кампании, а не отдельный для каждой карты.

У каждого player unit есть скорость. Скорость означает, сколько юнит может пройти за день.

Общий дневной ход активного отряда равен минимальной скорости среди юнитов, которые не находятся в лагере.

Игрок завершает день вручную.

На события должны навешиваться hooks:

```txt
onDayEnd
onDayStart
```

К ним могут быть привязаны:

```txt
healing in camp
map events
dialogues/cutscenes
shop daily assortment refresh
temporary campaign effects
enemy/map events
```

Это значит, что day system должна быть campaign/domain system, а не частью battle.

---

## 5. Player unit lifecycle

Между боями с player unit могут происходить:

```txt
HP increase/decrease
one-time damage/healing
camp healing
class change
sprite evolution
skill tree progression
equipment changes
move to camp / return from camp
permanent non-removable effects
```

HP сохраняется между боями. После победы battle exit должен перенести HP выживших player units обратно в campaign state.

Пример permanent effect:

```txt
+5 armor forever
```

Такие эффекты являются campaign-level unit state, а не battle active effects.

Battle active effects остаются временными runtime effects внутри боя.

---

## 6. Progression

У юнитов есть разветвленная система улучшений.

Progression влияет на:

```txt
level
stats
skills
class/evolution choices
sprite evolution
possibly movement speed
equipment restrictions
```

Выбор одного из новых tier-улучшений персонажа может запускать свою отдельную сцену.

Progression не является battle concern. Battle получает уже resolved runtime unit input.

Архитектурно progression может оставаться в `core` на текущем этапе, но должна быть отделена от battle runtime так, чтобы позднее ее можно было вынести в отдельный домен `progression/`.

---

## 7. Items, equipment and shops

Будет широкая система вещей для player units.

У врагов вещей не будет.

Items system включает:

```txt
shared backpack
equipment slots by class
battle consumables
activatable items
loot after battle
shops on maps
```

Crafting убран из будущего плана.

Не будет:

```txt
durability
charges on items
crafting
```

Charges будут у skills, но не у предметов.

Расходники списываются сразу при использовании в бою. Если бой проигран, это game over, поэтому откат состояния не нужен. Если игрок использует replay battle, состояние расходников должно откатываться к pre-battle snapshot.

Магазины на картах имеют сохраняемое состояние.

У магазина может быть несколько вещей, которые точно должны быть в продаже всегда, пока их не купят. Купленные предметы исчезают из магазина.

Остальной ассортимент обновляется каждый день. Для магазина задаются категории товаров и уровень товаров. Из каждой категории выбирается `N` вещей каждого вида указанного уровня. По умолчанию `N = 1`, но для каждого магазина можно настроить свое значение.

Inventory/equipment являются campaign state. В battle передается resolved projection:

```txt
unit stats with equipment bonuses
unit activatable item abilities
available battle consumables
```

---

## 8. Enemies

Враги всегда генерируются из definitions.

Уникальные боссы тоже являются обычными enemy definitions с уникальным definition id.

Не будет persistent enemy entity, с которым можно встретиться повторно как с тем же runtime объектом.

Нет повторных встреч с тем же enemy entity.

На карте сохраняется только состояние enemy group:

```txt
alive/dead
position
enemyGroupId / definition reference
```

Так как частичного боя нет, не нужно хранить HP врагов между заходами на карту.

---

## 9. Battle lifecycle

Бой запускается из encounter/enemy group на карте.

В бою нет:

```txt
waves
reinforcements
retreat
surrender
defeat without game over
battle continuing after scene transition
mid-battle save
undo/rollback
deterministic seed requirement
```

Цель боя всегда одна:

```txt
kill all enemies
```

Победа:

```txt
all enemies dead → battle won → rewards/results → enemy group marked dead on map
surviving player HP is written back to campaign state
used consumables remain spent
```

Поражение:

```txt
player defeated → game over / no campaign continuation
```

Replay battle уже есть и должен остаться. Replay battle должен использовать pre-battle snapshot для отката расходников и других battle-start campaign projections.

Battle runtime не является save source. Сохраняться можно только между боями.

---

## 10. Battle field

Поле боя остается статичным как сейчас. В этой части геймплея ничего не менять.

Текущее поле по коду:

```txt
2 rows × 3 columns на сторону
side: player | enemy
row: 0 | 1
col: 0 | 1 | 2
```

`cellExists()` жестко проверяет:

```txt
row = 0 или 1
col = 0..2
side = player/enemy
```

Поддерживаются unit shapes:

```txt
1x1
1x2
2x1
2x2
```

Placement проверяет:

```txt
anchor belongs to correct side
all occupied shape cells exist
cells are free
cells are on correct side
```

Skill patterns также обрезаются по границам текущего 2x3 поля. Это важно сохранить.

---

## 11. Targeting

Текущие targeting rules нужно сохранить.

По коду сейчас:

```txt
melee:
  - если attacker в back row и свой front row занят → melee blocked
  - если enemy front row занят → можно бить только occupied front-row cells
  - иначе можно бить occupied back-row cells

ranged:
  - можно выбирать любые occupied enemy cells

friendly/mass_enchantment:
  - можно выбирать occupied friendly cells

self_enchantment:
  - target = own caster cell
```

Эти правила являются частью текущего gameplay и должны пережить рефакторинг.

---

## 12. Skill system

Текущая система скиллов уже качественная и должна остаться полностью. Ее можно рефакторить по слоям и файлам, но нельзя заменять, упрощать или выкидывать.

Сейчас skill состоит из composable blocks:

```txt
Skill
  id
  name
  actionType
  damageBlock?
  effectBlock?
  instantEffectBlock?
  damageModifierBlocks?
  postDamageBlock?
```

Текущие `actionType`:

```txt
melee
ranged
mass_enchantment
self_enchantment
```

Текущие damage types:

```txt
physical
magical
```

### Damage matrices

Есть reusable named damage matrices:

```txt
DAMAGE_MATRICES
```

Примеры:

```txt
single
cross
row_sweep
pierce
```

Каждая matrix имеет levels. Skill damageBlock выбирает:

```txt
matrixName
damageType
level
```

### Effect matrices

Есть reusable effect matrices:

```txt
EFFECT_MATRICES
```

Effect block выбирает:

```txt
effectMatrixName
level
effectDisplayName
effectName
duration
damageType
```

### Leveled effects

Есть `LEVELED_EFFECTS` с двумя режимами:

```txt
effectDamageType → per-turn value from caster stat × pattern multiplier
bonusByLevel → fixed stat bonus by level
```

Текущие effect families:

```txt
regeneration
lose_health
fortify / weaken
arcane_shield / arcane_vulnerability
swift / clumsy
guard_stance / off_balance
haste / slow
empower / enfeeble
arcane_surge / arcane_drain
```

### Instant effects

Есть instant effects:

```txt
provoke
distract
```

Instant effect matrices используют `damageMultiplier` как probability `0..1`.

Instant effects:

```txt
ignore dodge/block/defense
only affect units that still have a turn in current roundQueue
return provoked/distracted unit ids
caller mutates queue / behavior
```

### Damage modifiers

Есть damage modifier blocks:

```txt
ignore_block
ignore_dodge
ignore_physical_defense
ignore_magical_defense
```

Значение определяется по levels:

```txt
25 / 50 / 75 / 100%
```

### Post-damage blocks

Есть post-damage effects:

```txt
self_vampirism
mass_vampirism
```

Vampirism считается от real damage без overkill.

### Active effects

Battle runtime active effects:

```txt
max 2 active effects per unit
new duplicate replaces same effect id
if full, oldest non-duplicate is evicted
remainingRounds decrements on round end
tick can heal/damage
expired effects removed
```

`effectiveStats(unit)` применяет active effect bonuses к runtime stats.

### Future skill extensions

К текущей системе будут добавлены:

```txt
cooldowns
charges
```

Это должно быть сделано как расширение существующей Skill/Unit runtime модели, а не как замена skill system.

---

## 13. Battle runtime state

BattleState должен хранить только runtime battle data:

```txt
units
occupancy
roundQueue
phase
validTargets
benchUnits as refs
placementSelection
active effects on units
```

BattleState не должен хранить:

```txt
display snapshots
campaign inventory
campaign progression source data
map state
shop/dialogue/cutscene state
```

Bench в BattleState хранит runtime refs:

```txt
BenchUnitRef { templateId }
```

Так как persistent player unit уникален в save line, `templateId` подходит для player bench identity.

---

## 14. Battle setup

Battle setup является projection из campaign/debug state в battle runtime.

Input sources:

```txt
campaign state
debug battle state
```

Battle setup resolves:

```txt
player unit levels
player current HP from campaign state
chosen upgrades
permanent bonuses
equipment bonuses
skills
sprite sheet
activatable item abilities
available battle consumables
bench refs
enemy definitions
enemy placement inputs
pre-battle snapshot needed for replay
```

Battle setup logic должна быть чистыми core functions/modules. `PhaseManager` владеет lifecycle, но не содержит тяжелую логику расчета.

Финальный принцип:

```txt
PhaseManager = lifecycle/transition owner
core pure functions = setup/snapshot calculation
battle pure functions = runtime battle algorithms
```

---

## 15. Debug battle

Debug battle уже есть и должен остаться как gameplay feature.

Архитектурно debug должен быть четко отделен от production campaign:

```txt
debug state отдельно от CampaignState
debug battle setup строится из debug state
debug equipment/upgrades affect debug setup
debug battle does not mutate campaign state
```

Пока debug system нужна только для battle, но архитектура должна оставить возможность расширить ее позднее.

Debug должен использовать тот же battle runtime и snapshot contracts, что и normal battle, но иметь отдельный source state.

---

## 16. Dialogues and cutscenes

В игре будут диалоги и катсцены.

Они являются campaign/map-level systems, не battle systems.

В кампании выборы в диалогах не влияют на состояние кампании.

Для них нужно хранить:

```txt
dialogue flags
cutscene watched flags
event triggers
map/campaign conditions
```

Они должны входить в campaign save state.

Scenes для dialogue/cutscene должны получать render data через `GamePhase`, как и остальные screens.

Выбор tier-улучшения персонажа может запускать отдельную сцену, но это относится к progression flow, а не к dialogue consequence system.

---

## 17. Save/load model

Сохраняется только campaign-level state между боями.

Нельзя сохраняться во время боя.

Должно поддерживаться до 100 save slots.

Save source:

```txt
CampaignState
global campaign day
map states
party/unit state
unit current HP
inventory/equipment
shop state
dialogue/cutscene flags
current map/party position
```

Не save source:

```txt
GamePhase as canonical state
battle runtime during active battle
Phaser scene state
UI local state
```

Так как battle не сохраняется в середине, `BattleState` может оставаться runtime structure с `Map`, но все campaign save data должны быть serializable.

Replay battle должен использовать pre-battle snapshot, чтобы восстановить расходники и другие battle-start projections.

---

## 18. Architectural constraints derived from gameplay

Из этого gameplay следуют такие архитектурные правила:

```txt
shared/ contains contracts only
data/ contains content definitions only
battle/ contains pure runtime battle rules
core/ owns orchestration and read-model builders
campaign/world/inventory/progression may become separate domains as systems grow
scenes render and route input only
ui is game-agnostic
```

Особенно важно:

```txt
do not rebuild skill system
do not change battlefield dimensions/rules
do not make enemies persistent runtime entities
do not make GamePhase save source
do not let debug mutate campaign state
do not make PhaseManager a god object
do not store battle display snapshots in BattleState
do not reintroduce crafting unless gameplay plan changes
```

---

## 19. Refactor safety checklist

При любом глобальном рефакторинге нужно проверять, что сохранилось:

```txt
2x3 battlefield per side
unit shapes 1x1/1x2/2x1/2x2
melee/ranged/friendly/self targeting rules
damage matrices
effect matrices
instant effect matrices
damage modifiers
post-damage vampirism
active effect limit/ticking/expiration
skill system remains composable and intact
future skill cooldowns/charges extend existing system
bench preview with upgraded stats/skills/sprite
battle replay
replay restores pre-battle consumable state
debug battle
debug battle does not mutate campaign state
normal battle victory marks enemy group dead
victory writes surviving player HP back to campaign state
campaign state persists killed enemy groups per map
camp is global inactive roster, not per-map storage
global campaign day drives day start/end hooks
shops support persistent must-have stock plus daily generated assortment
crafting remains out of scope
```

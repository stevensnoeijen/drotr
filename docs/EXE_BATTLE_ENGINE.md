# Battle engine internals from `DRACULA.EXE` (reverse-engineered)

Notes on how the original game runs a battle: units, selection, orders,
pathfinding, target acquisition and damage. They were found while patching the
original executable to run on modern Windows (no-CD, cnc-ddraw, CD audio as
OGG, English translation, gameplay hooks). They describe behaviour and data
layout only; no original code is reproduced.

Use them as a reference for matching the original's rules, for example the real
target-acquisition range instead of a hand-picked `aggroRange`.

## Which build

All addresses are virtual addresses (VA) in the **Dutch DeAgostini OEM build**
of `DRACULA.EXE` (PE32, **614,912 bytes**, image base `0x400000`).

| section | VA | file offset |
|---|---|---|
| `.text` | `0x401000` | `0x400` |
| `.rdata` | `0x469000` | `0x67e00` |
| `.data` | `0x46a000` | `0x68e00` |
| `.idata` | `0x7a4000` | `0x95000` |

The section VAs match the English build described in
[`MAP_FORMAT.md`](./MAP_FORMAT.md), but file offsets and the position of data
that follows the string tables differ. For example, `0x470900` holds text in
the Dutch build but the building-site count table in the English build,
because the Dutch strings are longer. Code addresses are probably the same, but
this has **not** been checked against an English executable. As
`MAP_FORMAT.md` already advises, anchor on code patterns rather than raw
constants.

## Global battle state

| VA | type | meaning |
|---|---|---|
| `0x5e941c` | `i32` | index of the side array in use (the human player's battle) |
| `0x5e9428[side]` | `Unit*` | unit array for that side, `0x190` bytes per unit |
| `0x5e9390[side]` | `i32` | number of **player** units. They occupy indices `0 .. n-1` |
| `0x5e9360[side]` | `i32` | total units. Enemies occupy indices `n .. total-1` of the **same** array |
| `0x7a1c68` | `i32` | number of currently selected units |
| `0x5a8388` | `u32[256][256]` | battle cell grid, indexed `x * 256 + y` (see below) |
| `0x7a2140` | `i32` | "immortal" flag (set by the `IAMIMMORTAL` cheat) |
| `0x5ea90c` | `i32` | pathfinding steps already spent this game tick |
| `0x5ea908` | `i32` | battle mode: `2` running, `3` paused |
| `0x4931c0` | `i32[]` | sight table, indexed per unit kind, values `2..5` |

Player and enemy units share one array. Unit `+0x10` (owner) tells them apart.

## Battle cell grid (`0x5a8388`)

The battle is played on a **256×256** grid of half-tiles: the 128×128 county
map with each tile split 2×2. This is the half-tile grid the remake already
moves units on. Each cell is a `u32`:

| bits | meaning |
|---|---|
| `0x0000ffff` | occupant: unit index **+ 1** (`0` = empty) |
| `0x00040000` | impassable terrain or wall |
| `0x00100000` | tower/rampart cell. Units here get +4 detection range |

A unit-at-cell lookup (`0x455430`, cdecl `(x, y) -> index or -1`) reads the low
16 bits and subtracts 1.

## Unit record (`0x190` bytes)

Offsets that were confirmed by reading code or watching live values:

| offset | type | meaning |
|---|---|---|
| `+0x10` | `i32` | owner: `0` player, `1` enemy |
| `+0x128` | `i32` | program counter into the current order (see Orders) |
| `+0x130` | `i32` | attack target: unit index, `-1` = none |
| `+0x134` | `i32` | own unit index **+ 1** (projectiles copy it to credit the shooter) |
| `+0x14c` | `u8*` | current order (heap byte string). `NULL` = idle |
| `+0x16c` | `i32` | selected flag |
| `+0x178` | `f64` | health. The unit is marked dead (state `5`) when it drops below a constant (likely hit points) |
| `+0x180` | `i32` | cell x (0–255) |
| `+0x184` | `i32` | cell y (0–255) |
| `+0x188` | `i32` | unit type (below) |
| `+0x18c` | `i32` | state: `0` idle, `1` moving, `5` dead, `6` stepping away. `2` is skipped by the target scan (meaning not confirmed, possibly engaged) |

Unit types (`+0x188`) follow the order of the training screen and the select
hotkeys:

| value | unit |
|---|---|
| 0 | swordsmen |
| 1 | crossbowmen |
| 2 | knight (2×2 footprint) |
| 3–4 | other infantry/spy slots (not confirmed) |
| 5 | battering ram |
| 6 | catapult |
| 7 | cannon |

A per-type table at `0x7a2050` (`0x20` / `0x40`) marks small and large
footprints.

## Orders are tiny byte programs

An order is a heap-allocated byte string at `+0x14c`, executed from `+0x128`:

| byte | meaning |
|---|---|
| `0`–`7` | one step in one of the 8 directions. A move order is the planned path as a direction string |
| `9` | attack the unit in `+0x130` |
| `0x0b` | attack the wall or gate cell given in `+0x141`/`+0x142` (rams, artillery) |

Clearing an order (`0x45ccf0`, thiscall) frees the string and zeroes `+0x14c`
and `+0x128`. An idle unit is therefore `+0x14c == NULL` and state `0`. Live
logging confirmed this both before and after a move completes.

## Orders issued by the player

| VA | convention | what it does |
|---|---|---|
| `0x459930` | thiscall `(x, y, a3, force)`, `ret 0x10` | **move to** cell. With `force == 0` it only acts on selected, non-busy units |
| `0x45a1c0` | thiscall `(x, y, force)`, `ret 0xc` | **attack whatever is at** cell `(x, y)`. A unit becomes order `9`, a wall becomes `0x0b`, empty ground becomes a move |
| `0x4582a0` | thiscall `(x0, y0, x1, y1)` | select if inside the rectangle (plain click or rubber band) |
| `0x4583d0` | thiscall `(x0, y0, x1, y1)` | add to the selection if inside (SHIFT) |

Mouse handling for battles sits around `0x44c5a0`–`0x44d600`. The game polls
the button once per frame, so the second press of a fast double-click is often
missed. Watch window messages if you need double-click.

The `CTRL+S/C/K/J/T/N` "select visible …" hotkeys (around `0x44e5c0`) define the
on-screen rectangle as `camX*2-2 < x < camX*2+26` and `camY*2-2 < y < camY*2+26`
(camera at battle object `+0x57a58` / `+0x57a5c`), i.e. about 28×28 cells.

## Pathfinding (`0x422c30`)

The original already uses a proper A\* variant:

- **Two-ended:** two open lists, one growing from the start and one from the
  goal, expanded alternately. The search ends where they meet.
- **8 directions.** Cost **16** orthogonal, **23** diagonal (≈16·√2).
- **Heuristic:** Manhattan distance × 16. It slightly overestimates
  when diagonal moves are possible, so paths are near-optimal rather than
  optimal.
- **Blocking:** an argument chooses whether only terrain blocks (`0x40000`) or
  units do too (`0xffff`).
- **Open list:** per-cell `next`/`prev` arrays (`0x6403b8`, `0x6803b8`) with a
  sorted linked-list insert, O(n) per insertion.
- **Limits:**
  - **10,000 expanded nodes** per search (`cmp …, 10000` at `0x422dab`, and
    `0x42321e` in the second routine).
  - **10,000 steps per game tick** shared by all units (`0x5ea90c`, checked at
    `0x459a43` and `0x459b13`).

  When the per-tick budget is exhausted, the move order falls back to walking
  straight at the target. **This is why large armies in the original get stuck
  on trees and walls.**

  Raising both limits 20× (to 200,000) removed the stuck-unit problem without
  measurable stutter on a modern PC.

The move-order code (`0x459930`) first walks the goal back toward the unit
until it finds a cell without `0x40000`, then plans a path.

## Target acquisition (around `0x4574c7`)

Every unit runs a nearest-enemy scan **once every 16 frames**, staggered by
unit index: `(index + frame) % 16 == 0`.

- It is skipped for units in state `1` (moving), `2` (engaged) or `5` (dead).
- Distance is **Chebyshev** in cells: `max(|dx|, |dy|)`.
- The nearest enemy is attacked (order `9`) if it is within:

| owner | range in cells |
|---|---|
| player | `2 * sight + 2` |
| enemy AI | `2 * sight + 4` |
| either, standing on a `0x100000` cell | `+ 4` |

`sight` comes from the table at `0x4931c0` (values 2–5), so the player's
detection range is **6–12 cells** and the AI's 8–14. The enemy deliberately
sees further.

`SHATTERTHEFOG` sets the sight entries to `7`.

## Damage (`0x45ba10`)

thiscall `(this = victim, damage, attacker_index)`, `ret 8`. `attacker_index`
is `-1` for scripted damage.

Callers:

- **Melee hit** (`0x4564b7`): victim = `units[attacker+0x130]`, attacker =
  `attacker+0x134 - 1`.
- **Projectile hit** (`0x45665c`): attacker = `projectile+0x134 - 1`.
- **Another strike path** (`0x45a687`).

The function checks `0x7a2140` (immortal) for player units before applying
damage.

**Original behaviour worth matching or deliberately fixing:**

- A unit that is hit does **not** retaliate. Nothing in the damage path assigns
  a target. An idle unit only reacts if the next 16-frame scan happens to pick
  the attacker. A moving unit ignores attackers until it arrives.
- Crossbowmen do not back away from melee.

Effects marked *inferred* were read from the code, not watched in play.

## Cheats

Cheats are recognised only while **paused** (`0x5ea908 == 3`).

- **Input:** letters arrive as `WM_KEYDOWN` and collect into a buffer
  (`0x4145b0`). Any non-letter resets it.
- **Lookup:** a table of codes and handlers is built at `0x414240`.
- **After a match:** the handler plays a sample, sleeps 1 s and then flushes
  the message queue up to the next key-down. That flush swallows the next key,
  usually the PAUSE meant to resume.

| code | effect |
|---|---|
| `IAMIMMORTAL` | player units take no damage (`0x7a2140 = 1`) |
| `ARMAGEDDON` | 666 damage to every enemy (indices `n .. total-1`) |
| `SHATTERTHEFOG` | sight table entries set to 7 |
| `LETTHEREBELIGHT` | writes `0x80` over a map-sized array, probably lighting or revealing it (inferred) |
| `NIGHTOFTHELIVINGDEAD` | revives dead player units (inferred) |
| `SKILLCOMESBYAGE` | loops over player units, probably making them veterans (inferred) |
| `ARTILLERYCOMESINHANDY` | artillery-related (inferred) |
| `TIMEISOFESSENCE` | sets a per-type table at `0x493134` to 4 (speed, inferred) |
| `KAMIKAZE` | unconfirmed. It behaves differently when the immortal flag is set |
| `STRONGERSTEEL` | armament level +1 (max 5) |
| `BETTERBRICKS` | architecture level +1 (max 4) |
| `PERSIMONSSON` | joke screen about Per Simonsson |

On a machine with no sound device, a cheat crashes the game: the sample player
(`0x4241a0`) does not check for a null DirectSound object (`0x6f0848`).

## Other notes

**Music.** Tracks 2–8 of the CD are Red Book audio, played through
`mciSendString("play cdaudio from N to N+1 notify")`.

- The window procedure answers `MM_MCINOTIFY` with any status other than
  `ABORTED` by replaying the current track, so the music loops.
- The CD volume is found via `mixerGetLineInfoA` with
  `MIXERLINE_COMPONENTTYPE_SRC_COMPACTDISC` and faded with `auxSetVolume`.

**Paths.** Install paths come from `HKLM\SOFTWARE\ComputerHouse\Dracula`
(`InstallPath`, `SourcePath`). The CD check (`0x41d5f0`) looks for a drive
labelled `Dracula`.

**Text.** All in-game text is in `.data`, referenced through pointer tables and
`push imm32`. It is drawn either with `Book Antiqua`
(`CreateFontA` at `0x41db97`, cell height 15) or with the bitmap font in the
`.ART` sheets.

**Screen layout.** In battle the map view starts at screen x = 160 (the left
panel is 160 px wide), and one cell is **20 px** on screen at 640×480.

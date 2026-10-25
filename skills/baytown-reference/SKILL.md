---
name: baytown-reference
description: Baytown Builder numbers, runtime data model, save format, milestones, and browser readiness checks. Read before changing simulation or persistence.
---

# Baytown reference · milestone 6

The canonical game is `../../index.html`, relative to this directory. It is a single offline HTML file, with WebGL2, inline CSS/JS/SVG, and no runtime library. Use the existing isolated checkout; do not create a worktree unless requested. Read `../../REQUIREMENTS.md` before extending a milestone. Approval is required before each next milestone.

## Scope and numbers

Milestones 1–3 implement construction, persistence, utility networks, budgets, workers, customers, happiness, home growth, two tiers of goals, and a seeded living world with traffic, walkers, pets, harbor ships and day/night lighting. Moving figures illustrate the household population and have no independent income effect or saved identities. Milestone 4 adds opt-in staged disasters, repair sites, defenses and mountain dynamite. Milestone 5 adds first-person home visits and saved decorating. Milestone 6 adds Ethan Tower, a giraffe garden, biplane skywriting, parades and final copy/layout polish. All six code milestones are implemented; real-device testing remains unverified. Disasters default off. New starter towns include extra free links and two extra parks; v1 migration preserves the old layout exactly.

| Rule                       | Value                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Map                        | 72 × 72; tile centers are integer x/z; y is height                                 |
| Default seed               | 81024                                                                              |
| Start funds                | $30,000; starter buildings are free                                                |
| Sandbox                    | Unlimited, displayed as such; new objects have paid = 0                            |
| Undo                       | 40 construction transactions; a road drag is one transaction                       |
| Refund                     | Exactly the object’s recorded `paid`; starter objects refund 0                     |
| Base capacity              | Cottage 4; family home 6; town house 8; apartments 16; villa 8; level 2 doubles it |
| Placeable object cap       | 5,000                                                                              |
| Save file size limit in UI | 2,000,000 bytes                                                                    |
| Zoom                       | 10–80 map units vertically                                                         |
| DPR cap                    | Low 1; balanced 1.5; high 2                                                        |
| Animation                  | Fixed actor pools, water shimmer and turbine blades; frozen for reduced motion     |
| Low quality                | At most ~30 fps                                                                    |
| Autosave                   | Check every 5 seconds; only save changed state                                     |

| Place                                      |                          Cost | Footprint                  |
| ------------------------------------------ | ----------------------------: | -------------------------- |
| Road / bridge / dock / sea wall            | 40 / 160 / 100 / 140 per tile | 1 × 1                      |
| Bay cottage / family home / town house     |           600 / 1,200 / 1,600 | 2 × 2                      |
| Apartments / garden villa                  |                 2,800 / 2,200 | 2 × 2 / 3 × 3              |
| Police / fire / hospital / coast guard     | 2,400 / 2,600 / 4,000 / 2,800 | 2 / 2 / 3 / 2 tiles square |
| Town hall / school / library / post office | 3,200 / 2,200 / 1,800 / 1,400 | 3 / 3 / 2 / 2 tiles square |
| Wind turbine / water tower / power plant   |         1,600 / 1,800 / 3,600 | 2 / 2 / 3 tiles square     |
| Café / market / office / workshop          | 1,000 / 1,400 / 2,400 / 2,000 | 2 / 2 / 2 / 3 tiles square |
| Park / tree / flower bed / bench           |            400 / 40 / 60 / 50 | 2 / 1 / 1 / 1 tiles square |
| Harbor house / lighthouse / mountain       |           2,800 / 2,000 / 500 | 3 / 2 / 3 tiles square     |

All footprints are square. `R` or the touch turn button rotates visual orientation, not footprint size. Bridges require water and an adjacent road/bridge. Docks require water and an adjacent land tile/dock. Regular places require dry land. Placement stops a drag at the first blocked/unaffordable tile; already matching road tiles are skipped. Removal may continue across empty tiles.

## Data model and save version 5

`SAVE_VERSION = 5`. Keep `tests/fixtures/v1.json`, `v2.json`, `v3.json`, `v4.json` and `v5.json` readable in future versions. `migrations[5]` is an identity upgrade for the new `ethantower`/`giraffegarden` object types; it inserts no objects and preserves rooms/adventures/economy. `migrations[4]` is an identity upgrade: home interiors are optional, and default rooms initialize lazily on first visit. `migrations[3]` adds `{enabled:false,event:null,serial:0}` as `disasters`, preserving all existing data. The migration table is keyed by **destination** version. `migrations[2]` preserves v1 money, object IDs, types, positions, rotation, paid amounts, name, seed, timestamps, and camera. It initializes the new calendar at day 1, clears new history/claim fields, and initializes each existing home at level 1 with ceil(base capacity / 2) residents and growth 0. No roads or buildings are added during migration. `migrations[1]` is the initial identity entry.

```text
Town {
  version: 5,
  name: nonempty string <= 32 characters,
  seed: uint32,
  mode: "starter" | "empty" | "sandbox",
  money: finite number in [0, 1e12],
  objects: Object[] (<= 5000),
  created, updated: epoch milliseconds,
  camera: {x, z, zoom, angle, pitch},
  day: positive safe integer <= 1e9,
  dayProgress: finite fraction in [0, 1),
  speed: 1 | 3, simPaused: boolean,
  claimedGoals: unique known goal ID strings[],
  profitableDays, thrivingDays: consecutive-day counters,
  lastBudget: null | DayReport,
  disasters: { enabled: boolean, event: null | {type,time,x,z,serial}, serial: integer 0..1e9 },
  history: DayReport[] (last 60 completed days, with closing money)
}
Object {
  id: unique integer in [1, 2147483646],
  type: own key of DEFS except "remove",
  x, z: integer top-left tile,
  rotation: 0 | 1 | 2 | 3,
  paid: finite original purchase amount, 0 <= paid <= definition cost,
  damaged?: boolean, // repair site; residents/level preserved
  // homes only:
  interior?: { wall: integer 0..7, floor: integer 0..7, items: Furniture[] },
  residents: integer in [0, base capacity * level],
  level: 1 | 2,
  growth: integer in [0, 4] (reset to 0 once a level-2 home is full)
}
```

IDs are internal, not array positions. Allocation restarts at an unused low ID if an imported town approaches the integer range boundary. Occupancy is a rebuilt `Int32Array(72 * 72)` containing IDs. Terrain is a regenerated `Uint8Array`: 0 water, 1 grass, 2 sand. Tree positions/colors derive from the seed; the ocean and northwest lake silhouette remain recognizable for every seed. Neither terrain nor renderer resources are stored in the save.

Validation rejects unsupported versions, malformed required fields, unsafe IDs, unknown object types, out-of-map footprints, and overlapping objects before changing the open town. Do not add functions or HTML to save data. Render imported names with textContent, not innerHTML.

## Persistence contract

- IndexedDB database `baytown-builder`, schema 1, object store `saves` contains serialized JSON strings keyed `auto`, `slot1`, `slot2`, `slot3`, `backup`.
- localStorage mirrors these as `baytown:<key>`. Graphics/audio/lighting/motion preferences are `baytown:settings`: quality = low/auto/high, sound = boolean, lighting = cycle/day/night, motion = lively/still. Missing or unknown new preference values fall back to cycle/lively; old settings remain usable.
- Loading considers independently validated copies and chooses the newest valid `updated` timestamp.
- Save writes are serialized. Version 2 validates the calendar, home growth, goal claims, and bounded history before replacing an open town. Either backend succeeding counts as saved; the UI warns when neither works. Export remains available when storage is denied/full.
- Save the old open town to `backup` before importing/loading another town or starting another. Abort replacement if both backup writes fail; ask the player to export first.
- Invalid file imports leave the open town untouched. Inspect both raw autosave mirrors before restoring a valid fallback. Archive unreadable originals under unique recovered-\* keys in either working backend, expose their downloads in the notebook, and block replacement if neither archive write works. Before any town is opened, all normal save writes are blocked. The unreadable-save screen also offers a direct file download. Archival copies are deduplicated by raw contents.
- Page hide synchronously writes the local mirror and attempts IndexedDB. Storage persistence is requested from the save notebook. No browser-storage API guarantees permanent retention: offer file export.
- Origin changes do not transfer IndexedDB/localStorage. Keep an existing published artifact URL stable. Never replace an existing artifact without user direction.

## Engine and iOS-oriented checklist

The renderer batches cubes, gabled roofs, low-poly foliage, and turbine rotors with instanced WebGL2 attributes. Static instance buffers rebuild on construction/layer/hover changes. Frame rendering reuses typed matrices, fixed actor arrays, BFS scratch buffers and a dynamic instancing buffer. It does not create actors, vectors, path arrays or GPU buffers each frame. Actor pools cap at 124; dynamic model parts cap at 2,048 cube instances. There are no particles (cap 0); milestone 4 reuses the dynamic buffer for up to 64 event/collapse pieces.

- Safe areas: `viewport-fit=cover`; top and bottom HUD respect `env(safe-area-inset-*)`.
- All buttons: minimum 52 × 52 CSS px. No hover-only action is required.
- Pointer Events with capture; `touch-action:none` only on the map. Two-finger gestures cancel construction; pointer cancellation does not commit a drag.
- Audio is off by default; create/resume AudioContext only following a user gesture.
- `prefers-reduced-motion` freezes actor/water/turbine movement and holds automatic lighting at 14:00. A MediaQueryList listener applies preference changes during play; the economy still advances. Manual day/night views remain available. Quality caps DPR, with a 30 fps option.
- Card thumbnails use inline SVG immediately, then progressively rasterize during idle time; SVG remains if generation fails.
- `webglcontextlost` prevents default, retains CPU city state, and pauses drawing. Restoration recreates program, geometry/instance buffers, viewport and resources, then redraws.
- Serve on a stable origin; autosave, slots, local mirror, file export/import and recovery have browser tests.
- Real iPad Safari, Home Screen installation, physical-device thermal/frame-rate behavior and VoiceOver navigation are **not verified** by Chromium emulation.

## Required validation

Run `npm ci` then `npm test`, or use the prepared Playwright location as documented in README. The test server uses an ephemeral port and requires no manually started service. Both iPad orientations use Chromium/SwiftShader. Check actual executed counts and failures, and inspect the generated `screenshots/baytown-ipad-portrait.png` and `screenshots/baytown-ipad-landscape.png`. Have an independent subagent review changes, as REQUIREMENTS.md asks. Run the real seeded 60-day simulation in tests/economy.test.cjs (included by npm test), inspect its generated test-results/economy-60-days.json report, and retain the browser 60-day save-validation check. No zero-test run counts as readiness.

## Milestone 2 economy contract

`SIMULATION_CORE_START` / `SIMULATION_CORE_END` delimit the pure inline simulation used by both runtime and Node tests. Do not implement a separate test-only economy. `analyzeCity` computes a forecast without mutating a save; `stepEconomy` settles one day, updates growth/history, and returns the next forecast. Construction, undo, load, growth and grants refresh the affected derived state.

- One day = 60 active seconds; speed 1× or 3×. Pausing, any dialog, document invisibility, and WebGL context loss stop time. There is no offline catch-up or lump charge on returning. Clock deltas are capped at 250ms to prevent large jumps after a stall.
- Roads and bridges carry utilities; docks do not. Orthogonally adjacent road tiles form networks; coordinate edges never wrap. Buildings attach at footprint edges, and do not themselves bridge unrelated networks. If several networks touch a consumer, choose the usable network with the best utility coverage, rather than scan order. A source touching multiple networks splits its capacity evenly across them; capacity is never duplicated. This milestone models finite network supply, without individual pipe-width upgrades or per-road flow bottlenecks.
- Wind supplies 80 power units; plant 300; tower 160 water units. Utilities operate automatically without workers. Every resident demands 1 unit of both. Café, market, harbor, and staffed civic/emergency services demand 2 of both; office 4; workshop 6. Supply is proportionally shared among network consumers, so the delivered sum never exceeds capacity. Any utility shortfall makes income/utility strength 0.5; two missing utilities still mean 0.5, not 0.25.
- Adults = floor(population × 0.5), also computed independently per road network for job allocation. Jobs are filled in deterministic ID round-robin order within that network and never exceed its adults. Disconnected workplaces have no workers.
- Homes earn $8 per resident/day, multiplied by utility strength. Offices earn $12 per worker/day; workshops $16, also scaled by utility strength. Shops share unique residents reachable within 10 **road edges**; a resident shops once/day. Each shop handles up to 40 customers, earns $2/customer, and scales revenue by filled jobs / available jobs and utility strength. A nearby but disconnected or long-detour home is not a customer.
- Happiness starts at 60. Nearby service bonuses scale by staffing and utility strength. Only the strongest of each place type counts, so duplicate parks do not stack endlessly. Employment adds 4 when every connected adult has a job. Missing road costs 6; each missing/short utility costs 8. Nuisances stack to a maximum penalty of 24. Population-weighted town happiness is clamped to 0–100.
- At happiness >=75, with road access and both utilities fully delivered, one resident moves in after 2 consecutive happy days. At base capacity, 5 consecutive happy days add a second floor and double capacity. Homes never lose residents or floors; a settled level-2 home resets its growth counter. New homes start half-full. Additional floors use the existing footprint and have no construction charge or extra upkeep in this milestone.
- Daily balance = home + shop + work income − upkeep, rounded to cents. Funds clamp at zero; unpaid upkeep is forgiven with no debt, damage, eviction, or removal. Sandbox keeps its funds while still reporting forecasts. Warn when a negative balance leaves at most 5 days of funds. Grants refresh that runway immediately.
- Undo stores added IDs, removed objects and the construction money delta. It reverses only construction, preserving elapsed days, history, income, and growth of unrelated homes. It does not unclaim goals. If undoing a removal would cost more than available funds, retain the transaction and explain the required funds.

### Daily upkeep, jobs, reach and happiness

| Type                                              |            Upkeep/day |      Jobs | Service radius / bonus               |
| ------------------------------------------------- | --------------------: | --------: | ------------------------------------ |
| Road / bridge / dock / sea wall                   | .05 / .15 / .10 / .10 |         0 | —                                    |
| Cottage / family / town house / apartment / villa |    2 / 4 / 6 / 12 / 8 |         0 | —                                    |
| Wind / power plant / water tower                  |            4 / 16 / 4 |         0 | Plant nuisance −8 within 8 tiles     |
| Café / market / harbor                            |           8 / 10 / 10 | 4 / 6 / 6 | Customer reach 10 road edges         |
| Office / workshop                                 |               12 / 16 |   10 / 12 | Workshop nuisance −12 within 8 tiles |
| Police / fire                                     |               10 / 10 |     4 / 4 | 10 / +6 each                         |
| Hospital / coast guard                            |               16 / 10 |     8 / 4 | 12 / +10; 10 / +4                    |
| Hall / school                                     |                8 / 10 |     4 / 6 | 12 / +4; 10 / +8                     |
| Library / post office                             |                 6 / 5 |     2 / 2 | 10 / +8; 8 / +3                      |
| Park / tree / flower / bench                      |     2 / 0 / .10 / .05 |         0 | 6 / +10; 2 / +1 each                 |
| Lighthouse / mountain                             |                 2 / 0 |         0 | 8 / +2; none                         |

### Goal grants

Tier 1: 3 homes → $300; 10 non-path places → $500; 30 road/bridge/dock tiles → $500. Tier 2 unlocks after all three first-tier grants are claimed: 3 fully supplied homes → $600; 30 residents → $1,000; happiness >=80 and positive operating balance for 3 consecutive days → $1,500. Claims are manual, one-time, saved, and not repeatable by undo or reload. Sandbox records the claim without changing funds. Operating profit/history excludes grants and construction spending.

## Milestone 3 living-world contract

Milestone 3 shipped with save version **2**; milestone 4 upgrades it to version 3. Decorative actors, route positions, shader time and lighting preferences are not added to the city JSON. `dayProgress` already persists the calendar phase. Existing v1/v2 fixtures must continue to pass; no v3 fixture is appropriate without a v3 format.

`LIVING_CORE_START` / `LIVING_CORE_END` delimit the pure route/pool code exercised by `tests/living.test.cjs`. Use that exact implementation in tests, not a separate mock. Runtime state and diagnostic hooks are available through `window.__baytown.life`.

| Quality | Vehicles | Walkers | Pets | Ships | Stars | Automatic lamps | Route plans/frame |
| ------- | -------: | ------: | ---: | ----: | ----: | --------------: | ----------------: |
| low     |       12 |      18 |    6 |     1 |    64 |              48 |                 1 |
| auto    |       24 |      36 |   12 |     3 |   160 |              96 |                 2 |
| high    |       40 |      60 |   20 |     4 |   256 |             128 |                 3 |

- A fixed 124-slot pool stores kinds, variants, homes, routes, interpolation, positions, heading, speed, wait and arrival coordinates in typed arrays. Route storage is 124 × 5,184 Int16 entries (~1.3 MB), allocated once. BFS queue/parents are reusable 5,184-entry Int16 arrays. Dynamic rendering reuses 2,048 × 11 float instance storage and one GPU buffer with WebGL2 bufferSubData. No particles are created.
- At creation/load, topology edits, population changes or graphics changes, rebuild navigation and reseed the decorative pool. Unchanged city data reuses existing routes. Generated models/colors/start positions are deterministic for the seed, town and quality. Nothing from this system changes funds, jobs, utility demand, goals, or home residents.
- Cars use road/bridge tiles, walkers/pets use road/bridge/dock tiles. Four-neighbor BFS honors grid boundaries and obstructions. Spawns come from occupied homes with at least two connected path cells; there is no traffic on arbitrary empty roads. Counts are ceil(reachable residents / 3) cars, ceil(reachable residents × .8) walkers and ceil(reachable residents × .2) pets, each capped by quality. Destinations use reachable building addresses with a connected-path fallback.
- Vehicles vary among cars, vans and buses, with eight body palettes. Walkers vary in shirts/skin; pets vary in coats. Speeds are 1.1–1.8, .38–.58, .5–.75 and .45–.65 tiles/second for cars, walkers, pets and ships. Movement follows the game speed (1×/3×). This is illustrative traffic, not congestion or collision physics.
- Lane/sidewalk offsets are .15 / .36 / .30 tiles for cars / walkers / pets. Interpolate between offset waypoints through corners. When a new route starts, preserve its actual arrival position so a reversal does not jump to the other sidewalk. Road/bridge/dock heights interpolate .11 / .28 / .21; ship base height is −.06.
- A harbor needs an adjacent connected dock component. Find berths by walking up to three orthogonal unoccupied natural-water steps from connected pier tiles; never infer berth access across land or a blocking bridge/wall from distance alone. Navigable hull cells require all 3 × 3 surrounding tiles to be water and unoccupied, and a water component with at least 12 cells. Land, docks, bridges and sea walls block ship navigation. Each harbor may host two boats, subject to the global cap. Boats travel out and back to the berth, pausing 3–7 seconds on return. There are ferry, cargo and fishing/tug variations; no ship revenue is added.
- World hour = (8 + dayProgress × 24) modulo 24. Automatic sunlight, warm dawn/dusk, night tint and stars follow that cycle. Manual day is 13:00; manual night is 22:00. Reduced-motion automatic lighting stays at 14:00. No independent lighting calendar is saved.
- Powered occupied-home windows and other powered-building windows use emissive material 4, bulbs/navigation lights material 5, transparent ground-light discs material 6, and rotating turbine blades material 7. Some windows stay dark for variation. Lamps are automatic roadside decorations, capped above and attached to supplied road networks; they do not change economy numbers. Stars are seeded once on a pointer-transparent canvas and fade with night. Night map labels use lighter ink.
- Pause, dialogs, hidden documents and context loss stop actor, water and turbine time. A still moment freezes those decorative motions while calendar/economy lighting continue. Live reduced-motion changes stop/resume movement without a reload. WebGL restoration recreates static and dynamic buffers, then reapplies viewport and lighting; CPU actor/town data remain intact.
- Keep existing economy and persistence tests. Add night/harbor screenshots in both iPad sizes and exercise quality caps, pause/still modes, live reduced motion, road edits and context recovery with ships. Inspect genuine shader output as well as derived metadata. Actual iPad Safari performance remains unverified by headless Chromium.

## Milestone 4 disaster contract

Save version **3** persists opt-in status, event progress and damaged flags. Migration initializes old towns with events off. Validate event type (tornado/earthquake/meteor/tsunami), time [0,20), integer map anchors, matching event/outer serial, and enabled status for a non-null event. Missing/invalid state in v3 is rejected; import failure leaves the open town unchanged. No offline catch-up.

`DISASTER_CORE_START/END` contains the real deterministic exposure, hit-time and protection rules tested in Node. `window.__baytown.disasters` exposes start, step, repair, dynamite, show and protection for browser checks. Time advances from the existing active simulation clock: warning 0–5 seconds; staggered deterministic impacts 5–15; event visuals 5–17; recovery to 20. Pauses, dialogs, hidden documents and context loss stop it; 3× applies. Saved time crossing determines each hit once; no repeated impacts on reload. Opt-in launches are manual only. Starting clears construction undo; building/undo are blocked during the event. Stop/off clears only the active event, preserving repair sites.

Inland events anchor at the first home or (40,36): tornado |x-anchor|<18 and |z-anchor|<5, earthquake distance<15, meteors distance<11. Tsunami targets x>=46. Roads, bridges, docks, walls, mountains, trees, flowers and benches are immune. This is stylized geometric exposure, not fluid/structural simulation. Residents, level, footprint and original paid amount survive collapse. Repair sites retain services/income at half their otherwise calculated strength; utility sources supply half capacity. Damage combines with utility shortages. Home growth pauses while damaged. Upkeep and workforce remain unchanged.

Police/hospital/fire/coastguard prevent 75% of deterministic tornado/quake/meteor/wave hits respectively within 12 tiles (anchor distance). Emergency protection continues while a station is damaged, independent of staffing/utilities. Sea walls east of a building within 18 columns and within size+1 rows block waves fully. Defense resolution does not depend on frame size.

Repair costs ceil(25% catalog cost), free in sandbox; insufficient funds change nothing. Repair clears undo to avoid stale construction money deltas. Clearing a damaged site refunds zero, clearly labeled. Mountain removal requires explicit $100 Dynamite from its inspector, free in sandbox; a construction transaction supports undo. Existing save recovery/backup behavior is unchanged.

Dynamic visuals use the preallocated 2,048-instance buffer, max 40 event parts plus 24 collapse parts, no particles; no world rebuild per frame. Reduced motion/still mode uses static event markers without falling/collapse animation. Context recovery preserves CPU event state. Tests cover core protection/exposure, both iPad orientations, opt-in UI, warning visibility, pause/build locks, repairs, all event completion, v1/v2/v3 fixtures, malformed state, dynamite undo, reduced motion and active-event context loss. Screenshots: disaster-ipad-portrait.png and disaster-ipad-landscape.png.

## Milestone 5 interior contract

Milestone 5 shipped with `SAVE_VERSION = 4`; optional per-home `interior` is the only new town field. v1→2→3→4 migrations retain all prior data. v4 fixture includes a decorated home; the v1/v2/v3 fixtures remain unchanged. Home rooms initialize lazily on first entry. Each is one main room (apartments use one representative unit), with no upper-floor navigation. Growth never resizes the room. Room data stays on its home through disaster damage, rebuild, construction removal/undo, slot/auto saves, export/import and recovery. Entering a damaged home is allowed; entering during an active adventure is blocked.

| Rule                                              | Value                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Cottage / family / town house / apartment / villa | 6×6 / 8×7 / 8×6 / 8×8 / 10×8                                                    |
| Choices                                           | 30 furniture types in six categories                                            |
| Palette                                           | 8 wall colors; 8 floor finishes                                                 |
| Cost / upkeep / income or happiness effects       | All zero                                                                        |
| Furniture cap                                     | 40/home, 1,000/town (including initialized defaults)                            |
| Room undo                                         | 40 edits during current visit; furniture and paint; clears on exit              |
| Walking                                           | 2.1 units/sec; eye height 1.55; radius .22                                      |
| Movement                                          | Normalized diagonal input; frame dt≤.05 sec; steps≤.08 units; axis sliding      |
| View                                              | Perspective vertical FOV60°, near .06/far60; decorate overhead orthographic     |
| Entry                                             | Center of southern doorway, z=depth−.55; reserved central two tiles in last row |

`Furniture { id: integer 1..1e6 (unique within room), type: own key of FURNITURE, x,z: integer top-left room-grid coordinates, rotation: 0..3 }`. Odd rotations swap width/depth. All pieces fit completely inside the room. Solid furniture cannot overlap other solids or the reserved doorway. Rugs are non-solid and may lie under furniture, including in the entry area, but may not overlap another rug. Placement uses the same `roomPlacement` function in runtime and tests. Import validation preflights known types, unique IDs, paints, bounds, rotation, collisions, room and town caps before replacing the open town. Non-home objects may not have interiors.

`INTERIOR_CORE_START/END` delimit the exact pure definitions, default rooms, placement validation, collision and walker code used by the Node suite. `window.__baytown.interior` exposes enter/leave/mode/paint/place/remove/turn/undo, readonly getters for transient session/current room, definitions/sizes/limits and diagnostic movement/validation hooks. The active home object is cached on the transient session; the session, camera, held inputs and undo are never serialized.

Default room: sea-glass walls, honey-oak floor, sofa at (0,0), bed at (0,depth−3), plant at (width−1,0), rug at (floor(width/2)−1,2). If those four pieces would exceed the town cap, initialize an empty room instead. This cap fallback never removes existing furnishings. Changes replace the room with a cloned next state; undo retains prior immutable room states. City undo preflights restored furniture count and leaves its transaction untouched if restoring a home would exceed 1,000 pieces. Rooms do not change the city’s operating forecast.

Home inspector → Come inside opens first-person mode. Touch pad supports held forward/back/strafe and turn buttons, concurrent scene-drag looking, and short taps. WASD/arrows walk; Q/E turn; R turns decor; Ctrl/⌘Z room undo; Ctrl/⌘S saves; Escape exits the room (Escape in a notebook closes it first). There is no pointer-lock requirement. Directional input clears on blur, visibility change, dialog open, mode change, context loss and exit. Dialogs make background room UI inert. Paint and the same Save notebook remain available inside. Town clock, disaster time and decorative life rest during a visit without changing the saved town pause preference. Walking remains user-directed even under reduced motion; no bob, automatic camera movement or particles.

Decorate mode fits the complete room between the measured header and editor bounds, preserving touch space in both orientations. Floor picking uses the shared inverse orthographic matrix. Choosing a catalog piece places it on a tap; tapping an existing piece selects it for move/turn/remove. A move keeps the old piece until its new location validates. Rotation that cannot fit retains the piece and explains why. Put tool away cancels selection/moving. Painting is free and undoable. All controls are at least 52px. Furniture cards use inline SVG sketches; 30 actual floor models use hand-built mesh parts.

The renderer reuses the existing instanced WebGL2 program/batches. Room edits rebuild static geometry; walking only updates preallocated matrices, reusing the cached home, avatar and input state without per-frame actor/vector/buffer allocation. **Engine cube y is a base height**; roomCube converts room models’ center-y coordinates to base-y, while foliage/discs retain their native anchoring. Walls meet the floor; no ceiling is drawn in decorate mode. A restored WebGL context rebuilds room geometry and the current perspective/orthographic view while retaining CPU room state. Exiting restores the untouched city camera and resets frame clocks, with no offline time catch-up. Loading another town closes the room only after validation and successful backup. Reload starts in city view.

Furniture: Seats (sofa, armchair, chair, stool, bench); Tables (dining, coffee, side, desk, round); Rest (bed, single, bunk, crib, ottoman); Storage (bookcase, wardrobe, dresser, cabinet, tv); Little things (plant, lamp, rug, largeRug, cushion); Play (toybox, teddy, train, aquarium, piano). Width/depth/height/color live in the inline FURNITURE table. Paint/floor indices live in ROOM_PAINT/ROOM_FLOORS.

Required checks include all earlier milestones, the exact pure collision/placement tests, actual iPad touch walking plus simultaneous look, all home types including a damaged one, floor picking/rotation/move/remove/undo, paint notebook stacking, real room export, reload/old fixtures/invalid imports, active-room context recovery, reduced motion, 52px controls, the global-cap construction-undo regression and 60-day economy. Inspect interior-walk-ipad-{portrait,landscape}.png and interior-decorate-ipad-{portrait,landscape}.png. Real iPad Safari remains unverified by Chromium emulation.

## Milestone 6 personal-feature contract

All six milestones are implemented. Save version **5** introduces `ethantower` and `giraffegarden` as own keys in DEFS, with no new required root fields. Migration 5 is identity. New fixture v5 contains both types and the decorated v4 home; never rewrite earlier shipped fixtures. Ordinary placement, terrain/occupancy/ID checks, recorded paid refunds, inverse construction undo, disaster repair flags and 25% rebuild charges apply. Existing towns are not populated with landmarks automatically.

| Type          | Footprint |  Cost | Upkeep | Jobs / income                   |    Utility demand | Service                |
| ------------- | --------- | ----: | -----: | ------------------------------- | ----------------: | ---------------------- |
| ethantower    | 3×3       | 6,000 |     20 | 16 jobs; 12 per staffed job/day | 6 power + 6 water | none                   |
| giraffegarden | 3×3       | 1,800 |      4 | no jobs/income                  |                 0 | radius8, +12 happiness |

The tower has stepped massing, lit windows, crown and a block-dot ETHAN nameplate. The garden includes two static giraffe models (body, long neck, ears, ossicones, legs and spots), fence, trough and planting. Giraffes are not independent pathfinding actors. New types use existing utility/workforce/service analysis and existing damage half-strength rules. Duplicate gardens do not stack their same-type happiness bonus.

`CELEBRATION_CORE_START/END` contains the actual 5×7 glyph masks, message, caps, `planParade` and `sampleParade`, extracted by Node tests. `window.__baytown.celebrations` exposes start/stop/step/info/show, fixed route/heights arrays and planner/sampler diagnostic hooks. SKY_MESSAGE is exactly `GO ETHAN!`; GIFT_GLYPHS also draws the tower name. Temporary celebration fields live in one reusable party object, not Town JSON. No extra save fixture fields are needed.

Settings → Ethan’s corner provides normal placement tools plus separate manual skywriting/parade starts. Builds show Free in sandbox and normal prices otherwise. No surprise scheduler, charges, grants or repeated rewards. At most one of each celebration runs at a time. Skywriting forms over 22 moving seconds; total event lasts 45 active seconds and cloud alpha fades during the last five. Parade duration is 45 active seconds, speed .8 tiles/sec with .7-tile follower lag. Low/auto/high caps are 6/10/12 marchers, further bounded by floor((routeLength−1)/.7), plus one float. Initial moving poses start at0; when launched under reduced/still mode, sky time starts22 and parade time12 for a completed quiet pose. Live reduced/still toggles freeze stored motion time without jumping, while event age continues. Lively mode resumes that same pose.

`advanceClock` steps event age after its existing pause/modal/hidden/context-loss/interior guards; speed1×/3× applies. Decorative motion time advances only when not reduced and motion=lively. The Finish banner stops both. A chosen disaster stops celebrations before beginning, and starts are rejected during an active disaster or home visit. Valid town replacement (after validation/backup) and new-town creation stop celebrations; invalid imports preserve the open town/event. Context restoration retains party state and route buffers while recreating GPU resources. Reload intentionally opens without celebrations.

Navigation uses the road/bridge mask; docks, water and structures are excluded. One fixed Int16 route, parent and queue (5,184 cells each), Float32 elevation array and four-float pose scratch are allocated once. For each connected component the planner uses two BFS sweeps to find a long shortest endpoint route, chooses the longest candidate across components and requires length≥6. This is not an exhaustive longest-simple-path search. Parent -1 marks unseen components and temporary -2 marks the current component’s second sweep. Four-neighbor boundary checks prohibit row wrapping. Sampling interpolates adjacent coordinates/elevations, reflects at endpoints and remains position-continuous through corners/return turns. Parade figures are decorative, without traffic collisions. A changed layout validates every used route tile against the refreshed mask; a removed tile ends the parade before rendering an invalid route. Other edits retain it. Bridge elevations use .28, roads .11.

Skywriting is a stylized camera-facing dot-cloud display and a modeled biplane, not a particle simulation. Layout measures guide/control bounds at launch, resize and return from a home visit, uses 90% of the available horizontal gap (bounded .25–.8 of viewport width), scales by current zoom/aspect, and anchors to the launch camera without map clamping. It shifts toward the camera by 18 world units along the view axis to avoid tall buildings occluding the letters without changing screen placement. Reusable five-float skyLayout records scale, altitude, width and actual x/z anchor for tests. Biplane size tracks the message, and the writing nose progresses across its width. Shader material8 uses uGiftFade for cloud opacity; context restoration recreates this uniform location.

Dynamic parts share the existing 2,048-instance buffer. Celebration geometry is below 500 instances, no particle pool is added, and numeric side/end loops avoid per-frame array literals. Model/route/pose state is reused. Static landmarks rebuild only with the existing world geometry. No runtime library, external font or network asset is added. Cards have inline SVG fallbacks and use the existing progressive thumbnail rasterizer. Plain help/removal copy now distinguishes healthy refunds, zero-refund repair sites and mountain dynamite.

Required validation: all earlier suites, five celebration core checks, actual iPad portrait/landscape hub/landmark/sky+parade screenshots, landmark price/refund/undo, workforce/service integration, fixed caps, paused and modal-held clocks, reduced/still continuity, active-event GPU recovery, edited routes, minimum zoom and both extreme camera edges, 45-second expiry, all v1–v5 fixture migrations, reload and unchanged town money/goals/furnishings. Inspect ethan-corner, ethan-landmarks and ethan-celebration screenshots in both sizes. Physical Safari/Home Screen, thermals and VoiceOver remain unverified.

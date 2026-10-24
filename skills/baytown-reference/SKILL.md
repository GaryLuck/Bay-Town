---
name: baytown-reference
description: Baytown Builder numbers, runtime data model, save format, milestones, and browser readiness checks. Read before changing simulation or persistence.
---

# Baytown reference · milestone 2

The canonical game is `../../index.html`, relative to this directory. It is a single offline HTML file, with WebGL2, inline CSS/JS/SVG, and no runtime library. Use the existing isolated checkout; do not create a worktree unless requested. Read `../../REQUIREMENTS.md` before extending a milestone. Approval is required before each next milestone.

## Scope and numbers

Milestones 1 and 2 implement construction, persistence, utility networks, budgets, workers, customers, happiness, home growth, and two tiers of goals. Residents are household counts, with no rendered walking/traffic yet. Milestones 3–6 (living world, disasters, interiors, personal features) remain unimplemented. Disasters are off. New starter towns include extra free links and two extra parks; v1 migration preserves the old layout exactly.

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
| Animation                  | Water shimmer only; disabled for reduced motion                                    |
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

All footprints are square in this milestone. `R` or the touch turn button rotates visual orientation, not footprint size. Bridges require water and an adjacent road/bridge. Docks require water and an adjacent land tile/dock. Regular places require dry land. Placement stops a drag at the first blocked/unaffordable tile; already matching road tiles are skipped. Removal may continue across empty tiles.

## Data model and save version 2

`SAVE_VERSION = 2`. Keep both `tests/fixtures/v1.json` and `v2.json` readable in future versions. The migration table is keyed by **destination** version. `migrations[2]` preserves v1 money, object IDs, types, positions, rotation, paid amounts, name, seed, timestamps, and camera. It initializes the new calendar at day 1, clears new history/claim fields, and initializes each existing home at level 1 with ceil(base capacity / 2) residents and growth 0. No roads or buildings are added during migration. `migrations[1]` is the initial identity entry.

```text
Town {
  version: 2,
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
  history: DayReport[] (last 60 completed days, with closing money)
}
Object {
  id: unique integer in [1, 2147483646],
  type: own key of DEFS except "remove",
  x, z: integer top-left tile,
  rotation: 0 | 1 | 2 | 3,
  paid: finite original purchase amount, 0 <= paid <= definition cost,
  // homes only:
  residents: integer in [0, base capacity * level],
  level: 1 | 2,
  growth: integer in [0, 4] (reset to 0 once a level-2 home is full)
}
```

IDs are internal, not array positions. Allocation restarts at an unused low ID if an imported town approaches the integer range boundary. Occupancy is a rebuilt `Int32Array(72 * 72)` containing IDs. Terrain is a regenerated `Uint8Array`: 0 water, 1 grass, 2 sand. Tree positions/colors derive from the seed; the ocean and northwest lake silhouette remain recognizable for every seed. Neither terrain nor renderer resources are stored in the save.

Validation rejects unsupported versions, malformed required fields, unsafe IDs, unknown object types, out-of-map footprints, and overlapping objects before changing the open town. Do not add functions or HTML to save data. Render imported names with textContent, not innerHTML.

## Persistence contract

- IndexedDB database `baytown-builder`, schema 1, object store `saves` contains serialized JSON strings keyed `auto`, `slot1`, `slot2`, `slot3`, `backup`.
- localStorage mirrors these as `baytown:<key>`. Graphics/audio preferences are `baytown:settings`.
- Loading considers independently validated copies and chooses the newest valid `updated` timestamp.
- Save writes are serialized. Version 2 validates the calendar, home growth, goal claims, and bounded history before replacing an open town. Either backend succeeding counts as saved; the UI warns when neither works. Export remains available when storage is denied/full.
- Save the old open town to `backup` before importing/loading another town or starting another. Abort replacement if both backup writes fail; ask the player to export first.
- Invalid file imports leave the open town untouched. Inspect both raw autosave mirrors before restoring a valid fallback. Archive unreadable originals under unique recovered-\* keys in either working backend, expose their downloads in the notebook, and block replacement if neither archive write works. Before any town is opened, all normal save writes are blocked. The unreadable-save screen also offers a direct file download. Archival copies are deduplicated by raw contents.
- Page hide synchronously writes the local mirror and attempts IndexedDB. Storage persistence is requested from the save notebook. No browser-storage API guarantees permanent retention: offer file export.
- Origin changes do not transfer IndexedDB/localStorage. Keep an existing published artifact URL stable. Never replace an existing artifact without user direction.

## Engine and iOS-oriented checklist

The renderer batches cubes, gabled roofs, low-poly foliage, and turbine rotors with instanced WebGL2 attributes. Static instance buffers rebuild on construction/layer/hover changes. Frame rendering reuses typed matrices and does not create arrays, vectors, particles, or vehicles. No traffic or particles exist yet; later milestones must set explicit caps before adding them.

- Safe areas: `viewport-fit=cover`; top and bottom HUD respect `env(safe-area-inset-*)`.
- All buttons: minimum 52 × 52 CSS px. No hover-only action is required.
- Pointer Events with capture; `touch-action:none` only on the map. Two-finger gestures cancel construction; pointer cancellation does not commit a drag.
- Audio is off by default; create/resume AudioContext only following a user gesture.
- `prefers-reduced-motion` freezes shader time. Quality caps DPR, with a 30 fps option.
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

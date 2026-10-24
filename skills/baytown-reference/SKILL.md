---
name: baytown-reference
description: Baytown Builder numbers, runtime data model, save format, milestones, and browser readiness checks. Read before changing simulation or persistence.
---

# Baytown reference · milestone 1

The canonical game is `../../index.html`, relative to this directory. It is a single offline HTML file, with WebGL2, inline CSS/JS/SVG, and no runtime library. Use the existing isolated checkout; do not create a worktree unless requested. Read `../../REQUIREMENTS.md` before extending a milestone. Approval is required before each next milestone.

## Scope and numbers

Milestone 1 implements construction and persistence only. No simulated days, revenue, upkeep, utilities, population movement, disasters, or interiors are enabled. Do not imply that home capacity is live population. Three goals count homes (3), built non-road places (10), and path tiles (30); completing them awards no money.

| Rule                       | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| Map                        | 72 × 72; tile centers are integer x/z; y is height             |
| Default seed               | 81024                                                          |
| Start funds                | $30,000; starter buildings are free                            |
| Sandbox                    | Unlimited, displayed as such; new objects have paid = 0        |
| Undo                       | 40 construction transactions; a road drag is one transaction   |
| Refund                     | Exactly the object’s recorded `paid`; starter objects refund 0 |
| Capacity                   | Cottage 4; family home 6; town house 8; apartments 16; villa 8 |
| Placeable object cap       | 5,000                                                          |
| Save file size limit in UI | 2,000,000 bytes                                                |
| Zoom                       | 10–80 map units vertically                                     |
| DPR cap                    | Low 1; balanced 1.5; high 2                                    |
| Animation                  | Water shimmer only; disabled for reduced motion                |
| Low quality                | At most ~30 fps                                                |
| Autosave                   | Check every 5 seconds; only save changed state                 |

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

## Data model and save version 1

`SAVE_VERSION = 1`. Keep `tests/fixtures/v1.json` readable in every future version. The migration table is keyed by **destination** version; a future v2 upgrade belongs at `migrations[2]`, must return migrated data, and must not discard progress. `migrations[1]` is the identity for the initial format.

```text
Town {
  version: 1,
  name: nonempty string <= 32 characters,
  seed: uint32,
  mode: "starter" | "empty" | "sandbox",
  money: finite number in [0, 1e12],
  objects: Object[] (<= 5000),
  created, updated: epoch milliseconds,
  camera: {x, z, zoom, angle, pitch}
}
Object {
  id: unique integer in [1, 2147483646],
  type: own key of DEFS except "remove",
  x, z: integer top-left tile,
  rotation: 0 | 1 | 2 | 3,
  paid: finite original purchase amount, 0 <= paid <= definition cost
}
```

IDs are internal, not array positions. Allocation restarts at an unused low ID if an imported town approaches the integer range boundary. Occupancy is a rebuilt `Int32Array(72 * 72)` containing IDs. Terrain is a regenerated `Uint8Array`: 0 water, 1 grass, 2 sand. Tree positions/colors derive from the seed; the ocean and northwest lake silhouette remain recognizable for every seed. Neither terrain nor renderer resources are stored in the save.

Validation rejects unsupported versions, malformed required fields, unsafe IDs, unknown object types, out-of-map footprints, and overlapping objects before changing the open town. Do not add functions or HTML to save data. Render imported names with textContent, not innerHTML.

## Persistence contract

- IndexedDB database `baytown-builder`, schema 1, object store `saves` contains serialized JSON strings keyed `auto`, `slot1`, `slot2`, `slot3`, `backup`.
- localStorage mirrors these as `baytown:<key>`. Graphics/audio preferences are `baytown:settings`.
- Loading considers independently validated copies and chooses the newest valid `updated` timestamp.
- Save writes are serialized. Either backend succeeding counts as saved; the UI warns when neither works. Export remains available when storage is denied/full.
- Save the old open town to `backup` before importing/loading another town or starting another. Abort replacement if both backup writes fail; ask the player to export first.
- Invalid file imports leave the open town untouched. Inspect both raw autosave mirrors before restoring a valid fallback. Archive unreadable originals under unique recovered-* keys in either working backend, expose their downloads in the notebook, and block replacement if neither archive write works. Before any town is opened, all normal save writes are blocked. The unreadable-save screen also offers a direct file download. Archival copies are deduplicated by raw contents.
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

Run `npm ci` then `npm test`, or use the prepared Playwright location as documented in README. The test server uses an ephemeral port and requires no manually started service. Both iPad orientations use Chromium/SwiftShader. Check actual executed counts and failures, and inspect the generated `screenshots/baytown-ipad-portrait.png` and `screenshots/baytown-ipad-landscape.png`. Have an independent subagent review changes, as REQUIREMENTS.md asks. Once the economy exists, add a real seeded 60-day simulation; do not invent a passing simulation for this construction-only milestone.

# Baytown Builder

A little town. A big imagination.

Open **[index.html](index.html)** to play. The game is one self-contained HTML file: a hand-written WebGL2 engine, inline assets, no runtime libraries, no downloads, and no network dependencies. A modern browser with WebGL2 is required. For the most reliable saves, serve it from a stable local origin:

```sh
npm start
```

This serves the checkout on port 8000 using Python 3. The file also works offline; browser storage behavior for directly opened files varies. Export a save file before changing origin, browser, or device.

## What works through milestone 4

- A deterministic 72 × 72 seaside map with an eastern ocean, northwest lake, trees, and hills.
- Starter village, empty land with $30,000, and unlimited sandbox modes.
- A catalog of 31 placeable types, plus removal, with distinct hand-built 3D models.
- Tap placement, building rotation, drag roads/bridges/docks, placement validation, full refunds, and 40 undo transactions. New roads join seamlessly.
- Pan, pinch/scroll zoom, camera rotation, a tile grid and a road view.
- Finite power and water along connected road networks, with utility bubbles and power/water map layers. Each separate network needs supply; insufficient utilities mean half strength, never lost buildings.
- A daily economy with home income, jobs limited by connected adults, road-distance-based local shopping, upkeep, and a budget notebook with history and early balance warnings. Running out of funds never removes progress or creates debt.
- Service radii, staffing, nuisance effects, and a happiness map. Happy supplied homes welcome new neighbors and eventually grow a second floor.
- Two chapters of three goals, with one-time grants. The calendar runs at one day per 60 seconds, with pause and 3× speed. Time stops while a dialog is open or the game is in the background; there is no offline catch-up.
- Seeded cars, vans and buses on roads/bridges, with walking neighbors and pets on sidewalks and connected docks. Paths reroute after construction; positions interpolate through corners and reversals.
- Harbor boats that travel between a clear-water berth and the surrounding water. Build a harbor on land against a dock, and give that dock a clear way out to open water. Ships cannot cross land, piers, bridges, or sea walls.
- A day/night cycle tied to the existing calendar, with warm powered windows, automatic street lamps, head/navigation lights, stars, and turning wind turbines. Settings offer a sunny view, a starry night, or a still moment.
- Versioned autosave, IndexedDB with a localStorage mirror, three named slots, a recovery backup before loading/starting another town, and file export/import. Invalid imports leave the open town untouched. Unreadable autosaves are preserved for download.
- WebGL context-loss recovery, safe-area padding, 52px minimum button targets, touch controls, keyboard controls, reduced motion, three graphics settings, and optional user-activated sound.

- Four manually launched, opt-in adventures: tornado, earthquake, meteor shower and tsunami. Use Settings → Choose an adventure. Each has a warning, an animated event, a calm finish, and a stop control. Disasters are off in new and upgraded towns.
- Repairable collapsed places keep their residents and floors, operate at half their usual strength, and cost 25% of the catalog price to rebuild (free in sandbox). Damaged utility sources supply half capacity. Clear a damaged site for no refund. Normal construction still refunds its recorded purchase price.
- Police, hospitals, fire stations and coast guards protect nearby places against their matching event. Sea walls shield nearby inland places from waves. Tap a placed mountain for $100 dynamite; clearing it can be undone.

**Milestones 5–6 remain later work:** interiors and personal Ethan features.

Moving figures illustrate the town’s population and routes; they do not change the economy or hold individually saved identities. Traffic congestion and physical vehicle collisions are not simulated. Save version 3 adds opt-in adventure state and repair flags. Existing v1/v2 saves upgrade with adventures off; the layout, money and residents are preserved. An event saved midway resumes at its saved stage without offline catch-up. Actors and their routes still regenerate.

The new starter town begins with 11 residents, room for 22, full utilities, 77 happiness, and a positive $39.58/day estimate. Existing towns keep their exact buildings, funds, and road layouts when upgraded from v1: use the new maps to connect any missing roads. Home residents initially fill half of each base home’s capacity during migration. Nothing is removed or charged for the upgrade.

## Controls

With no tool selected, drag to move around or tap a place to inspect it. With a tool selected, tap to build; drag to draw a road, bridge, dock, sea wall, or removal path. Two fingers always move the camera; pinch to zoom. Tap a selected card again to put the tool away. The turn button beside Undo rotates the next building.

| Key                     | Action                          |
| ----------------------- | ------------------------------- |
| Arrows / WASD           | Move the map                    |
| + / −                   | Zoom                            |
| Q / E                   | Turn the view                   |
| R                       | Turn the next building          |
| Space + drag on the map | Pan while holding a tool        |
| Escape                  | Put away a tool / close a panel |
| Ctrl/⌘ Z                | Undo                            |
| Ctrl/⌘ S                | Save now                        |

## Living-world controls and limits

The graphics setting controls fixed pools:

| Graphics        | Vehicles | Walkers | Pets | Ships | Stars |
| --------------- | -------: | ------: | ---: | ----: | ----: |
| Easy on battery |       12 |      18 |    6 |     1 |    64 |
| Balanced        |       24 |      36 |   12 |     3 |   160 |
| Extra crisp     |       40 |      60 |   20 |     4 |   256 |

Actual counts depend on occupied homes and usable paths. Each working harbor can host two boats, within the global ship cap. There are no particle effects. Street lamps are decorative and automatic; they add no new upkeep or utility demand.

Pause stops the economy, actors, water shimmer, wind turbines and the day/night cycle. Opening a dialog or hiding the page also stops motion. “A still moment” freezes decorative movement while the economy and lighting continue. Reduced motion follows live device preference changes: actors, water and turbines stay still, and automatic lighting stays in a sunny afternoon; manual day/night views remain available. Settings are saved locally per device and do not rewrite a city’s calendar or money.

## Browser checks

Node 24, npm 11, Python 3.12, and Chromium were used during development. Only the test tools need installation:

```sh
npm ci
npx playwright install chromium
npm test
```

If Chromium is already installed, skip the browser download. Tests automatically use `/usr/bin/chromium` when present; set `CHROMIUM_PATH` for another executable. In the prepared cloud machine, Playwright is available outside the checkout, so this also works without reinstalling:

```sh
NODE_PATH=/workspace/.baytown-tools/node_modules npm test
```

The suite starts its own local server. It uses real headless Chromium with ANGLE/SwiftShader, checks iPad portrait (768 × 1024) and landscape (1024 × 768), exercises touch and mouse input, and writes screenshots to `screenshots/`. It covers placement costs and rejection, drag transactions, rotation, refunds, camera controls, IndexedDB/localStorage saves, named slots, reloads, file export/import, the shipped v1/v2/v3 fixtures and migration, corrupt save handling, context recovery, storage failure, and multi-touch gestures. Milestone 2 checks also exercise utility layers, service rings, budget forecasts, pause/speed controls, home growth, day-spanning undo, two-tier goal grants, and 60 days of actual browser simulation. Milestone 3 adds real movement, actor-cap changes, live reduced-motion toggles, night-pixel/lighting checks, harbor visits, and GPU recovery while ships are visible. It also verifies that the game makes no external HTTP requests.

The pure living-world tests exercise the actual inline route planner and fixed pools: shortest paths and disconnections, bridge/dock rules, map boundaries, deterministic seeded variation, caps, reusable buffers, road removal, smooth corners/reversals, enclosed harbor entrances, and ship hull clearance.

The pure economy tests extract the same inline simulation used by the game. They check separated networks, finite source capacities, bridge versus dock behavior, sources shared between networks, workforce limits, road-distance shopping, unique customers, service radii/nuisances, growth, insolvency, and determinism. A seeded 60-day run writes `test-results/economy-60-days.json`. That report is generated by the current run and is not a save fixture.

Chromium emulation does **not** verify actual iPad Safari behavior or performance. Real-device testing remains necessary before calling the game iPad-ready. The named `ios-web-game-checklist` skill is not available in this checkout; the relevant safe-area, touch, sound-unlock, reduced-motion, quality, allocation, and storage checks are documented in [the reference skill](skills/baytown-reference/SKILL.md).

## Source and saves

`index.html` is the canonical source. Its nine numbered sections follow the engine/world/assets/city/sim/disasters/interior/ui/main structure requested in `REQUIREMENTS.md`. Runtime debug and acceptance-test hooks live at `window.__baytown`.

Read [baytown-reference](skills/baytown-reference/SKILL.md) before changing prices, map rules, or saves. Save version 2 is current; the v1 fixture remains supported by an explicit migration. Add a fixture and a migration when shipping another save version. Keep serving the same file from the same origin to retain browser storage. No artifact has been published from this checkout; publication and replacing an existing artifact require the user’s direction.

## Disaster rules (milestone 4)

Events only start when chosen; there is no random scheduler. Warning lasts 5 game seconds, impacts occur during the next 10, visuals last until second 17, and recovery finishes at second 20. Pause, dialogs, hidden tabs and context loss stop event time; 3× speed applies. Building and undo wait until the event ends. Stopping an event prevents future hits, while existing repair sites remain.

The first occupied home anchors inland events, or tile (40,36) in an empty town. Tornadoes affect a 36-tile-wide strip within 5 tiles of its row; quakes reach 15 tiles and meteors 11 tiles around that point. Waves affect buildings from column 46 eastward. Roads, bridges, docks, sea walls, mountains, trees, flowers and benches are spared. These are stylized adventures, without terrain destruction or fluid/structural physics.

Police protect against tornadoes; hospitals against earthquakes; fire stations against meteors; coast guards against waves. Within 12 tiles of the building’s anchor, they prevent 75% of deterministic hits. Emergency teams keep protecting while their station needs repair, without staffing/utility requirements. A sea wall east of a building, within 18 tiles and within its footprint size plus one row, fully shields it from waves. Effects reuse the existing dynamic GPU buffer: at most 40 event pieces plus 24 collapse pieces, with no particles. Reduced motion and still mode show static event markers.

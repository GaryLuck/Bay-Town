Build "Baytown Builder": a 3D city-building game for iPad, delivered as one
self-contained HTML file (WebGL2, hand-written engine, no libraries, no network
dependencies). It's a gift for Ethan, a kid, but should hold an adult's interest too.

FEEL
- Touch first (Safari tab, Home Screen app, or Claude artifact). Tap targets at
least 52px. Plain words a 9-year-old can read.
- Nothing wipes progress. Missing power or water makes a building run at half
strength with a bubble, never a scary failure. Disasters are opt-in (default
off) and exciting rather than frightening.
- Every building earns its place and the player can see why: service rings, a Map
view (power / water / services), utility bubbles, a budget panel. A greyed-out
card must say why ("needs $4,000").

THE GAME
- 72x72 tile map, ocean east, lake northwest. Modes: starter town, empty land,
sandbox (unlimited money).
- About 30 placeables in six categories (Homes, Emergency, Civic, Shops & Work,
Parks, Coast & Nature): 5 house types, police, fire, hospital, coast guard,
city hall, school, library, post office, power plant, wind turbine, water tower,
shops, office, factory, parks, harbor, lighthouse, mountains, trees.
Drag-to-draw roads, bridges, docks, undo. Sea walls and other disaster defenses.
- Economy (propose exact numbers first): power and water travel along roads with
capacity; jobs are capped by working adults; shops earn from road-connected
customers in reach; happiness comes from service radii minus nuisances; happy
homes grow (move-ins, second floor); daily income vs. upkeep with early
warnings before going broke.
- Living world: randomized vehicles, citizens and pets with pathfinding, ships at
the harbor, day/night cycle with lit windows, street lamps and stars.
- Four selectable disasters (tornado, earthquake, meteor shower, tsunami), each
staged in phases, with collapse animations, rebuild costs and protection from
services. Dynamite for mountains.
- Enter any home: first-person walk mode and decorating (about 30 furniture
items, wall and floor paint).
- Two tiers of goals. Personal touches for Ethan (his name on a signature
skyscraper, skywriting biplane, parade, giraffes). I'll direct these as we go.

ENGINEERING, FROM DAY ONE
1. Saves: versioned format with SAVE_VERSION and a migration table. Terrain
regenerates from a seed. IndexedDB with a localStorage mirror,
navigator.storage.persist(), autosave plus 3 slots, file export/import. Keep a
fixture for every shipped version.
2. WebGL context-loss recovery that rebuilds GPU resources and restores the city.
3. Run the ios-web-game-checklist: safe areas, audio unlock, reduced motion,
quality settings, no per-frame allocation, caps on particles and vehicles,
card thumbnails generated progressively with an SVG fallback.
4. Numbered code sections (engine, world, assets, city, sim, disasters, interior,
ui, main) and a window.__baytown debug handle.
5. A Playwright + headless Chromium (SwiftShader) test suite run at iPad portrait
and landscape sizes, plus a seeded economy sim of 60 game-days.
6. A baytown-reference skill documenting numbers, data model and save format,
updated whenever they change.

HOW TO WORK
- Build in milestones, each ending in a working, tested file:
(1) engine, terrain, roads, placement, save/load
(2) buildings, utilities, economy, goals
(3) living world
(4) disasters
(5) interiors and walk mode
(6) personal features and polish
- Before each milestone, show a one-screen plan with a numbers table. I'll say go.
- Before calling anything done: run the suite, send screenshots at iPad sizes, and
have an independent subagent review the diff. Fix what it finds.
- Keep the canonical source in this Project and publish to the same artifact URL
so saved cities survive. Ask before overwriting.
- Tell me about anything that differs from what I asked for.

# Baytown Builder

A little town. A big imagination.

Open **[index.html](index.html)** to play. The game is one self-contained HTML file: a hand-written WebGL2 engine, inline assets, no runtime libraries, no downloads, and no network dependencies. A modern browser with WebGL2 is required. For the most reliable saves, serve it from a stable local origin:

```sh
npm start
```

This serves the checkout on port 8000 using Python 3. The file also works offline; browser storage behavior for directly opened files varies. Export a save file before changing origin, browser, or device.

## What works in milestone 1

- A deterministic 72 × 72 seaside map with an eastern ocean, northwest lake, trees, and hills.
- Starter village, empty land with $30,000, and unlimited sandbox modes.
- A catalog of 31 placeable types, plus removal, with distinct hand-built 3D models. Service buildings are construction pieces for now.
- Tap placement, building rotation, drag roads/bridges/docks, placement validation, full refunds, and 40 undo transactions. New roads join seamlessly.
- Pan, pinch/scroll zoom, camera rotation, a tile grid and a road view.
- Three introductory construction goals.
- Versioned autosave, IndexedDB with a localStorage mirror, three named slots, a recovery backup before loading/starting another town, and file export/import. Invalid imports leave the open town untouched. Unreadable autosaves are preserved for download.
- WebGL context-loss recovery, safe-area padding, 52px minimum button targets, touch controls, keyboard controls, reduced motion, three graphics settings, and optional user-activated sound.

**Later milestones are not implemented.** “Room for” counts available home capacity, not simulated people. There is no daily income, upkeep, power/water flow, employment, home growth, living traffic, day/night cycle, disaster simulation, interiors, or personal Ethan features yet. The interface identifies these limits. There is no 60-day economy simulation to run until milestone 2.

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

The suite starts its own local server. It uses real headless Chromium with ANGLE/SwiftShader, checks iPad portrait (768 × 1024) and landscape (1024 × 768), exercises touch and mouse input, and writes screenshots to `screenshots/`. It covers placement costs and rejection, drag transactions, rotation, refunds, camera controls, IndexedDB/localStorage saves, named slots, reloads, file export/import, the shipped v1 fixture, corrupt save handling, context recovery, storage failure, and multi-touch gestures. It also verifies that the game makes no external HTTP requests.

Chromium emulation does **not** verify actual iPad Safari behavior or performance. Real-device testing remains necessary before calling the game iPad-ready. The named `ios-web-game-checklist` skill is not available in this checkout; the relevant safe-area, touch, sound-unlock, reduced-motion, quality, allocation, and storage checks are documented in [the reference skill](skills/baytown-reference/SKILL.md).

## Source and saves

`index.html` is the canonical source. Its nine numbered sections follow the engine/world/assets/city/sim/disasters/interior/ui/main structure requested in `REQUIREMENTS.md`. Runtime debug and acceptance-test hooks live at `window.__baytown`.

Read [baytown-reference](skills/baytown-reference/SKILL.md) before changing prices, map rules, or saves. Add a fixture and a migration when shipping a new save version. Keep serving the same file from the same origin to retain browser storage. No artifact has been published from this checkout; publication and replacing an existing artifact require the user’s direction.

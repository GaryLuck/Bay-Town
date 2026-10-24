"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const screenshots = path.join(root, "screenshots");
const fixture = require("./fixtures/v1.json");
const fixtureV2 = require("./fixtures/v2.json");
const launch = {
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
};
if (process.env.CHROMIUM_PATH)
  launch.executablePath = process.env.CHROMIUM_PATH;
else if (existsSync("/usr/bin/chromium"))
  launch.executablePath = "/usr/bin/chromium";

async function state(page) {
  return page.evaluate(() => JSON.parse(__baytown.serialize()));
}
async function api(page, method, ...args) {
  return page.evaluate(({ method, args }) => __baytown[method](...args), {
    method,
    args,
  });
}
async function clickTile(page, x, z) {
  const screen = await api(page, "worldToScreen", x, z);
  await page.mouse.click(screen.x, screen.y);
}
async function choose(page, name) {
  await page
    .getByRole("button", { name: new RegExp("^" + name + ",") })
    .click();
}
async function dragTiles(page, x0, z0, x1, z1) {
  const from = await api(page, "worldToScreen", x0, z0);
  const to = await api(page, "worldToScreen", x1, z1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test(
  "Baytown milestones 1–2 — real browser acceptance suite",
  { timeout: 180000 },
  async (t) => {
    await mkdir(screenshots, { recursive: true });
    const server = http.createServer(async (request, response) => {
      try {
        const route = new URL(request.url, "http://localhost").pathname;
        if (route === "/favicon.ico") {
          response.writeHead(204).end();
          return;
        }
        const filename = route === "/" ? "index.html" : route.slice(1);
        if (!["index.html", "tests/fixtures/v1.json"].includes(filename)) {
          response.writeHead(404).end();
          return;
        }
        const contents = await readFile(path.join(root, filename));
        response.writeHead(200, {
          "Content-Type": filename.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "application/json",
        });
        response.end(contents);
      } catch (_) {
        response.writeHead(500).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const browser = await chromium.launch(launch);
    t.after(async () => {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    });

    for (const [name, viewport] of [
      ["portrait", { width: 768, height: 1024 }],
      ["landscape", { width: 1024, height: 768 }],
    ]) {
      await t.test(`iPad ${name}`, { timeout: 70000 }, async (t) => {
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
          acceptDownloads: true,
        });
        const page = await context.newPage();
        const errors = [],
          external = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          if (/^https?:/.test(request.url()) && !request.url().startsWith(url))
            external.push(request.url());
        });
        t.after(() => context.close());
        await page.goto(url);
        await page
          .getByRole("button", { name: "Let's build a town" })
          .waitFor();

        await t.test(
          "welcome, touch targets and actual WebGL2 rendering",
          async () => {
            await page.screenshot({
              path: path.join(screenshots, `welcome-ipad-${name}.png`),
            });
            await page
              .getByLabel("What should we call your town?")
              .fill("Seaglass Test");
            await page.getByRole("button", { name: /A blank canvas/ }).click();
            await page
              .getByRole("button", { name: "Let's build a town" })
              .click();
            await page.waitForFunction(() => __baytown.getReady());
            const result = await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => {
                    __baytown.flush();
                    const gl = __baytown.getGL(),
                      pixel = new Uint8Array(4);
                    // Read the real rendered map, not a mock context.
                    gl.readPixels(
                      gl.drawingBufferWidth / 2,
                      gl.drawingBufferHeight / 2,
                      1,
                      1,
                      gl.RGBA,
                      gl.UNSIGNED_BYTE,
                      pixel,
                    );
                    const small = [...document.querySelectorAll("button")]
                      .filter((b) => {
                        const r = b.getBoundingClientRect();
                        return (
                          r.width &&
                          r.height &&
                          (r.width < 51.9 || r.height < 51.9)
                        );
                      })
                      .map((b) => ({
                        text: b.textContent,
                        width: b.getBoundingClientRect().width,
                        height: b.getBoundingClientRect().height,
                      }));
                    resolve({
                      version: gl.getParameter(gl.VERSION),
                      error: gl.getError(),
                      instances: __baytown.getInstances(),
                      small,
                      overflow:
                        document.documentElement.scrollWidth > innerWidth,
                      touch: navigator.maxTouchPoints,
                      pixel: [...pixel],
                    });
                  }),
                ),
            );
            assert.match(result.version, /WebGL 2/);
            assert.equal(result.pixel[3], 255);
            assert.ok(
              result.pixel[1] > result.pixel[0] &&
                result.pixel[0] > result.pixel[2],
              "the center of the empty map must actually render green land",
            );
            assert.equal(result.error, 0);
            assert.ok(result.instances > 3000);
            assert.ok(result.touch > 0);
            assert.equal(result.overflow, false);
            assert.deepEqual(result.small, []);
          },
        );

        await t.test(
          "tap placement, occupied/water rejection, capacity and funds",
          async () => {
            await api(page, "setView", 38, 36, 20);
            await choose(page, "Bay cottage");
            await clickTile(page, 38, 35);
            const placed = await state(page);
            assert.equal(placed.objects.length, 1);
            assert.equal(placed.objects[0].type, "cottage");
            assert.equal(placed.money, 29400);
            assert.equal((await api(page, "stats")).capacity, 4);
            await clickTile(page, 38, 35);
            assert.equal((await state(page)).objects.length, 1);
            const water = await api(page, "placementCheck", "cottage", 65, 35);
            assert.equal(water.ok, false);
            assert.match(water.reason, /dry land/);
          },
        );

        await t.test(
          "drag roads are one undo transaction; removal refunds",
          async () => {
            await choose(page, "Road");
            await dragTiles(page, 36, 34, 36, 39);
            assert.equal(
              (await state(page)).objects.filter((o) => o.type === "road")
                .length,
              6,
            );
            assert.equal((await state(page)).money, 29160);
            await page
              .getByRole("button", { name: "Undo last change" })
              .click();
            assert.equal((await state(page)).objects.length, 1);
            assert.equal((await state(page)).money, 29400);
            await choose(page, "Remove");
            await clickTile(page, 38, 35);
            assert.equal((await state(page)).objects.length, 0);
            assert.equal((await state(page)).money, 30000);
            await page.keyboard.press("Control+z");
            assert.equal((await state(page)).objects.length, 1);
          },
        );

        await t.test(
          "rotation, zoom, view turning, pan and canvas keyboard controls",
          async () => {
            await page.keyboard.press("Escape");
            const zoomButton = page.getByRole("button", {
              name: "Zoom in",
              exact: true,
            });
            const keyboardZoom = await page.evaluate(
              () => __baytown.camera.zoom,
            );
            await zoomButton.focus();
            await page.keyboard.press("Space");
            assert.ok(
              (await page.evaluate(() => __baytown.camera.zoom)) < keyboardZoom,
              "Space activates focused buttons",
            );
            const before = await page.evaluate(() => ({ ...__baytown.camera }));
            await page
              .getByRole("button", { name: "Zoom in", exact: true })
              .click();
            assert.ok(
              (await page.evaluate(() => __baytown.camera.zoom)) < before.zoom,
            );
            await page
              .getByRole("button", { name: "Turn the view", exact: true })
              .click();
            assert.notEqual(
              await page.evaluate(() => __baytown.camera.angle),
              before.angle,
            );
            await page.keyboard.press("ArrowRight");
            assert.notEqual(
              await page.evaluate(() => __baytown.camera.x),
              before.x,
            );
            await api(page, "setView", 38, 36, 20);
            await choose(page, "Bay cottage");
            await page
              .getByRole("button", { name: "Turn building", exact: true })
              .click();
            await clickTile(page, 41, 35);
            assert.equal(
              (await state(page)).objects.find((o) => o.x === 41).rotation,
              1,
            );
            await page.keyboard.press("Escape");
          },
        );

        await t.test(
          "named slot, IndexedDB mirror, autosave and reload",
          async () => {
            const before = await state(page);
            await page
              .getByRole("button", { name: "Save and load", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Save here", exact: true })
              .first()
              .click();
            await page.waitForFunction(() =>
              localStorage.getItem("baytown:slot1"),
            );
            await page.getByRole("button", { name: "Close dialog" }).click();
            await api(page, "saveKey", "auto");
            const mirrored = await page.evaluate(async () => {
              const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open("baytown-builder", 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              return new Promise((resolve) => {
                const r = db
                  .transaction("saves")
                  .objectStore("saves")
                  .get("slot1");
                r.onsuccess = () => {
                  db.close();
                  resolve(JSON.parse(r.result).objects.length);
                };
              });
            });
            assert.equal(mirrored, before.objects.length);
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.deepEqual((await state(page)).objects, before.objects);
            assert.equal((await state(page)).money, before.money);
            // IndexedDB recovers even if the localStorage mirror is missing.
            await page.evaluate(() => localStorage.removeItem("baytown:auto"));
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.deepEqual((await state(page)).objects, before.objects);
          },
        );

        await t.test(
          "real file export and import preserve progress; invalid file does not replace it",
          async () => {
            const before = await state(page);
            await page
              .getByRole("button", { name: "Save and load", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Export file", exact: true })
              .waitFor();
            const downloadPromise = page.waitForEvent("download");
            await page
              .getByRole("button", { name: "Export file", exact: true })
              .click();
            const download = await downloadPromise;
            const exported = JSON.parse(
              await readFile(await download.path(), "utf8"),
            );
            assert.deepEqual(exported.objects, before.objects);
            assert.equal(exported.version, 2);
            await page.locator("#import-input").setInputFiles({
              name: "broken.json",
              mimeType: "application/json",
              buffer: Buffer.from('{"version":999}'),
            });
            await page
              .getByRole("status")
              .filter({ hasText: /different save version/ })
              .waitFor();
            assert.deepEqual((await state(page)).objects, before.objects);
            await page.locator("#import-input").setInputFiles({
              name: "v1.json",
              mimeType: "application/json",
              buffer: Buffer.from(JSON.stringify(fixture)),
            });
            await page.waitForFunction(
              () => __baytown.state.name === "First little town",
            );
            await page.locator("#modal").waitFor({ state: "hidden" });
            assert.deepEqual(
              (await state(page)).objects,
              (await api(page, "validateSave", fixture)).objects,
            );
            const recovery = await api(page, "loadKey", "backup");
            assert.deepEqual(recovery.objects, before.objects);
          },
        );

        await t.test(
          "context-loss recovery rebuilds the GPU and preserves the town",
          async () => {
            const before = await state(page);
            const supported = await page.evaluate(() => {
              const extension = __baytown
                .getGL()
                .getExtension("WEBGL_lose_context");
              if (!extension) return false;
              extension.loseContext();
              setTimeout(() => extension.restoreContext(), 200);
              return true;
            });
            assert.equal(supported, true);
            await page
              .getByRole("status")
              .filter({ hasText: /Back to the bay/ })
              .waitFor();
            await page.waitForFunction(
              () => __baytown.getReady() && __baytown.getInstances() > 3000,
            );
            assert.deepEqual((await state(page)).objects, before.objects);
            assert.equal(await page.evaluate(() => __baytown.error), null);
          },
        );

        await t.test(
          "sandbox, connected bridge and dock placement, undo and budget rules",
          async () => {
            await api(page, "makeTown", "sandbox", "Unlimited Bay", 81024);
            // Find a shore tile at z=36 and approach it from dry land.
            const shore = await page.evaluate(() => {
              for (let x = 40; x < 71; x++)
                if (__baytown.terrain[36 * 72 + x] === 0) return x;
            });
            assert.equal(
              (await api(page, "placementCheck", "bridge", shore + 2, 36)).ok,
              false,
            );
            assert.equal(await api(page, "place", "road", shore - 1, 36), true);
            assert.equal(
              await api(page, "drawPath", "bridge", shore, 36, shore + 4, 36),
              5,
            );
            const dockShore = await page.evaluate(() => {
              for (let x = 40; x < 71; x++)
                if (__baytown.terrain[40 * 72 + x] === 0) return x;
            });
            assert.equal(
              await api(
                page,
                "drawPath",
                "dock",
                dockShore,
                40,
                dockShore + 2,
                40,
              ),
              3,
            );
            assert.equal((await state(page)).money, 30000);
            assert.equal((await state(page)).objects.length, 9);
            await api(page, "undo");
            assert.equal((await state(page)).objects.length, 6);
            // Finite mode cannot build beyond available funds; a drag stops cleanly.
            const limited = {
              ...fixture,
              money: 90,
              objects: [],
              mode: "empty",
            };
            await api(page, "applySave", limited);
            assert.equal(
              await api(page, "drawPath", "road", 36, 34, 36, 39),
              2,
            );
            assert.equal((await state(page)).money, 10);
            assert.equal(
              (await api(page, "placementCheck", "cottage", 40, 35)).ok,
              false,
            );
            await page.getByRole("tab", { name: "Homes", exact: true }).click();
            assert.match(
              await page
                .getByRole("button", { name: /^Bay cottage,/ })
                .innerText(),
              /Needs \$600/,
            );
          },
        );

        await t.test(
          "save validation rejects overlap, unsafe IDs, missing data and future versions",
          async () => {
            const samples = [
              { ...fixture, version: 99 },
              { ...fixture, money: -1 },
              {
                ...fixture,
                objects: [fixture.objects[0], { ...fixture.objects[0], id: 2 }],
              },
              {
                ...fixture,
                objects: [{ ...fixture.objects[0], id: 2147483647 }],
              },
              {
                ...fixture,
                objects: [{ ...fixture.objects[0], type: "__proto__" }],
              },
              { ...fixture, objects: [{ ...fixture.objects[0], x: 72 }] },
              { version: 1 },
            ];
            for (const sample of samples) {
              const rejected = await page.evaluate((s) => {
                try {
                  __baytown.validateSave(s);
                  return false;
                } catch (_) {
                  return true;
                }
              }, sample);
              assert.equal(rejected, true);
            }
            assert.equal((await api(page, "validateSave", fixture)).version, 2);
            const edgeID = {
              ...fixture,
              objects: [{ ...fixture.objects[0], id: 2147483646 }],
            };
            await api(page, "applySave", edgeID);
            assert.equal(await api(page, "place", "cottage", 40, 35), true);
            const stillValid = await api(
              page,
              "validateSave",
              await state(page),
            );
            assert.equal(stillValid.objects.length, 2);
          },
        );

        await t.test(
          "v1 migration preserves the town and v2 preserves the calendar, grown homes and goals",
          async () => {
            const migrated = await api(page, "validateSave", fixture);
            assert.equal(migrated.version, 2);
            assert.equal(migrated.money, fixture.money);
            assert.deepEqual(
              migrated.objects.map(({ id, type, x, z, rotation, paid }) => ({
                id,
                type,
                x,
                z,
                rotation,
                paid,
              })),
              fixture.objects,
            );
            assert.equal(migrated.objects[1].residents, 2);
            assert.equal(migrated.day, 1);
            await api(page, "applySave", fixtureV2);
            const loaded = await state(page);
            for (const key of [
              "day",
              "dayProgress",
              "speed",
              "simPaused",
              "claimedGoals",
              "objects",
            ])
              assert.deepEqual(loaded[key], fixtureV2[key]);
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.equal((await state(page)).objects[1].level, 2);
            assert.equal((await state(page)).objects[1].residents, 5);
            assert.equal((await state(page)).day, 8);
            for (const bad of [
              { ...fixtureV2, day: 0 },
              { ...fixtureV2, claimedGoals: ["homes", "homes"] },
              { ...fixtureV2, claimedGoals: ["not-a-goal"] },
              { ...fixtureV2, dayProgress: 2 },
              {
                ...fixtureV2,
                objects: [
                  fixtureV2.objects[0],
                  { ...fixtureV2.objects[1], residents: 9 },
                ],
              },
            ]) {
              assert.equal(
                await page.evaluate((s) => {
                  try {
                    __baytown.validateSave(s);
                    return false;
                  } catch (_) {
                    return true;
                  }
                }, bad),
                true,
              );
            }
          },
        );
        await t.test(
          "real clock advances, pause holds, notebooks stop time and speed is saved",
          async () => {
            await api(page, "makeTown", "starter", "Clock Bay", 81024);
            await api(page, "setPaused", false);
            const first = await state(page);
            await page.waitForTimeout(450);
            assert.ok((await state(page)).dayProgress > first.dayProgress);
            await page
              .getByRole("button", { name: "Pause town", exact: true })
              .click();
            const paused = await state(page);
            await page.waitForTimeout(250);
            assert.equal((await state(page)).dayProgress, paused.dayProgress);
            await page
              .getByRole("button", { name: "Change town speed", exact: true })
              .click();
            assert.equal((await state(page)).speed, 3);
            await page
              .getByRole("button", { name: "Resume town", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Town budget", exact: true })
              .click();
            const notebook = await state(page);
            await page.waitForTimeout(250);
            assert.equal((await state(page)).dayProgress, notebook.dayProgress);
            assert.match(
              await page.locator("#dialog").innerText(),
              /Next day estimate/,
            );
            assert.match(
              await page.locator("#dialog").innerText(),
              /Power capacity \/ demand/,
            );
            await page.screenshot({
              path: path.join(screenshots, `budget-ipad-${name}.png`),
            });
            await page.getByRole("button", { name: "Close dialog" }).click();
            await api(page, "setPaused", true);
          },
        );
        await t.test(
          "utility layers, service rings, status bubbles and live place details",
          async () => {
            await api(page, "makeTown", "starter", "Connected Bay", 81024);
            await api(page, "setPaused", true);
            await api(page, "setView", 38, 36, 24);
            const stats = await api(page, "stats");
            assert.equal(stats.suppliedHomes, 4);
            assert.equal(stats.powerSupply, 80);
            assert.equal(stats.waterSupply, 160);
            assert.ok(stats.net > 0);
            for (const layer of ["Power", "Water", "Services"]) {
              await page
                .getByRole("button", { name: "Map layers", exact: true })
                .click();
              await page
                .getByRole("button", { name: layer, exact: true })
                .click();
              assert.equal(
                await page.locator("#layer-legend").isVisible(),
                true,
              );
              await page.waitForTimeout(120);
            }
            await page.screenshot({
              path: path.join(screenshots, `services-ipad-${name}.png`),
            });
            await clickTile(page, 38, 32);
            await page.locator("#inspect").waitFor({ state: "visible" });
            const details = await page.locator("#inspect-details").innerText();
            assert.match(details, /Road access\s+Connected/);
            assert.match(details, /Power\s+Ready/);
            assert.match(details, /Water\s+Ready/);
            assert.match(details, /Happiness/);
            assert.match(details, /Daily upkeep/);
            await page
              .getByRole("button", { name: "Close place details" })
              .click();
            await api(page, "setLayer", "natural");
            await api(page, "applySave", fixtureV2);
            await api(page, "setView", 38, 36, 24);
            await page.waitForFunction(() =>
              document
                .querySelector("#utility-bubbles")
                .textContent.includes("P · W"),
            );
            await clickTile(page, 37, 36);
            assert.match(
              await page.locator("#inspect-details").innerText(),
              /Utility strength\s+50%/,
            );
            await page
              .getByRole("button", { name: "Close place details" })
              .click();
          },
        );
        await t.test(
          "construction undo preserves elapsed income and home growth",
          async () => {
            await api(page, "makeTown", "starter", "Growing Bay", 81024);
            await api(page, "setPaused", true);
            assert.equal(await api(page, "place", "cottage", 27, 32), true);
            await api(page, "advanceDays", 10);
            const after = await state(page);
            assert.ok(after.objects.some((o) => o.level === 2));
            const added = after.objects.find(
                (o) => o.type === "cottage" && o.x === 27,
              ),
              grown = after.objects.filter((o) => o.id !== added.id);
            await api(page, "undo");
            const undone = await state(page);
            assert.equal(undone.day, after.day);
            assert.equal(
              undone.money,
              Math.round((after.money + 600) * 100) / 100,
            );
            assert.deepEqual(undone.objects, grown);
          },
        );
        await t.test(
          "both goal tiers unlock in order, grant once and survive a reload",
          async () => {
            await api(page, "makeTown", "starter", "Goal Bay", 81024);
            await api(page, "setPaused", true);
            const before = await state(page);
            assert.equal(await api(page, "claimGoal", "utilities"), false);
            await page
              .getByRole("button", { name: "Collect $300", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Collect $500", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Collect $500", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Collect $600", exact: true })
              .click();
            assert.equal((await state(page)).money, before.money + 1900);
            assert.equal(await api(page, "claimGoal", "homes"), false);
            await page
              .getByRole("button", {
                name: "Your town’s little goals",
                exact: false,
              })
              .click();
            assert.equal(
              await page
                .getByRole("button", { name: "Complete", exact: true })
                .count(),
              4,
            );
            await page.getByRole("button", { name: "Close dialog" }).click();
            await api(page, "saveKey", "auto");
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.deepEqual((await state(page)).claimedGoals, [
              "homes",
              "places",
              "paths",
              "utilities",
            ]);
            assert.equal(await api(page, "claimGoal", "homes"), false);
          },
        );
        await t.test(
          "collecting a grant immediately refreshes the budget warning",
          async () => {
            await api(page, "makeTown", "starter", "Grant Bay", 81024);
            const low = await state(page);
            low.money = 1;
            low.simPaused = true;
            for (let i = 0; i < 3; i++)
              low.objects.push({
                id: 1000 + i,
                type: "hospital",
                x: 20 + i * 4,
                z: 20,
                rotation: 0,
                paid: 0,
              });
            await api(page, "applySave", low);
            assert.equal(
              await page.locator("#funds-warning").isVisible(),
              true,
            );
            assert.equal(await api(page, "claimGoal", "homes"), true);
            assert.ok((await api(page, "stats")).daysLeft > 5);
            assert.equal(
              await page.locator("#funds-warning").isVisible(),
              false,
            );
          },
        );
        await t.test(
          "early budget warning and sixty-day simulation never destroy progress",
          async () => {
            const limited = {
              ...fixture,
              money: 1,
              objects: [
                { id: 1, type: "hospital", x: 20, z: 20, rotation: 0, paid: 0 },
              ],
            };
            await api(page, "applySave", limited);
            await api(page, "setPaused", true);
            await page.locator("#funds-warning").waitFor({ state: "visible" });
            await page.locator("#funds-warning").click();
            assert.match(
              await page.locator("#dialog").innerText(),
              /Unpaid upkeep is forgiven/,
            );
            await page.getByRole("button", { name: "Close dialog" }).click();
            await api(page, "advanceDays", 60);
            const insolvent = await state(page);
            assert.equal(insolvent.money, 0);
            assert.equal(insolvent.objects.length, 1);
            assert.equal(insolvent.day, 61);
            assert.ok(insolvent.lastBudget.unpaid > 0);
            await api(
              page,
              "makeTown",
              "starter",
              "Sixty Days by the Bay",
              81024,
            );
            await api(page, "setPaused", true);
            const initial = await state(page);
            await api(page, "advanceDays", 60);
            const matured = await state(page),
              stats = await api(page, "stats");
            assert.equal(matured.day, 61);
            assert.equal(matured.history.length, 60);
            assert.ok(matured.money > initial.money);
            assert.ok(stats.population > 11);
            assert.ok(matured.objects.some((o) => o.level === 2));
            assert.equal(matured.objects.length, initial.objects.length);
            assert.equal((await api(page, "validateSave", matured)).version, 2);
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
            );
          },
        );

        await t.test(
          "starter town screenshot, offline independence and clean runtime",
          async () => {
            await api(page, "makeTown", "starter", "Baytown Bay", 81024);
            await page
              .getByRole("tab", { name: "Essentials", exact: true })
              .click();
            const starter = await state(page);
            assert.equal(
              (await api(page, "validateSave", starter)).objects.length,
              starter.objects.length,
            );
            await api(page, "saveKey", "auto");
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.deepEqual((await state(page)).objects, starter.objects);
            await page.waitForTimeout(4000); // Let toast and progressive thumbnails settle.
            await page.screenshot({
              path: path.join(screenshots, `baytown-ipad-${name}.png`),
            });
            const terrain = await page.evaluate(() => [...__baytown.terrain]);
            await api(page, "makeTown", "empty", "Same Seed", 81024);
            assert.deepEqual(
              await page.evaluate(() => [...__baytown.terrain]),
              terrain,
            );
            assert.deepEqual(external, []);
            assert.deepEqual(errors, []);
          },
        );
      });
    }

    await t.test(
      "unreadable autosave is preserved and can be downloaded before starting over",
      async () => {
        const context = await browser.newContext();
        try {
          const future = { ...fixture, version: 99 };
          await context.addInitScript(
            (raw) => localStorage.setItem("baytown:auto", raw),
            JSON.stringify(future),
          );
          const page = await context.newPage();
          await page.goto(url);
          await page
            .getByRole("heading", { name: "Keep this little world safe" })
            .waitFor();
          await page.keyboard.press("Escape");
          assert.equal(await page.locator("#modal").isVisible(), true);
          assert.equal(
            JSON.parse(
              await page.evaluate(() => localStorage.getItem("baytown:auto")),
            ).version,
            99,
          );
          assert.equal(
            await api(page, "saveKey", "auto"),
            false,
            "manual save must not save the placeholder town",
          );
          const downloadPromise = page.waitForEvent("download");
          await page
            .getByRole("button", { name: "Keep existing file" })
            .click();
          const download = await downloadPromise;
          assert.deepEqual(
            JSON.parse(await readFile(await download.path(), "utf8")),
            future,
          );
          await page
            .getByRole("button", { name: "Let's build a town" })
            .waitFor();
          assert.equal(await page.evaluate(() => __baytown.getReady()), false);
        } finally {
          await context.close();
        }
      },
    );

    await t.test(
      "leaving the unreadable-save notebook cannot overwrite progress with a placeholder town",
      async () => {
        const context = await browser.newContext();
        try {
          const future = { ...fixture, version: 99 };
          await context.addInitScript(
            (raw) => localStorage.setItem("baytown:auto", raw),
            JSON.stringify(future),
          );
          const page = await context.newPage();
          await page.goto(url);
          await page.getByRole("button", { name: "Open notebook" }).click();
          await page
            .getByRole("button", { name: "Export preserved file 1" })
            .waitFor();
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page.keyboard.press("Control+s");
          assert.equal(await api(page, "saveKey", "auto"), false);
          assert.deepEqual(
            JSON.parse(
              await page.evaluate(() => localStorage.getItem("baytown:auto")),
            ),
            future,
          );
          await page
            .getByRole("button", { name: "Let's build a town" })
            .click();
          await page.waitForFunction(() => __baytown.getReady());
          await page
            .getByRole("button", { name: "Save and load", exact: true })
            .click();
          const downloadPromise = page.waitForEvent("download");
          await page
            .getByRole("button", { name: "Export preserved file 1" })
            .click();
          const download = await downloadPromise;
          assert.deepEqual(
            JSON.parse(await readFile(await download.path(), "utf8")),
            future,
          );
        } finally {
          await context.close();
        }
      },
    );

    await t.test(
      "a valid fallback never destroys an unreadable mirror in either storage backend",
      async () => {
        for (const invalidBackend of ["local", "db"]) {
          const context = await browser.newContext();
          try {
            const future = {
              ...fixture,
              version: 99,
              name: "Keep my future town",
            };
            const page = await context.newPage();
            await page.goto(url);
            await page
              .getByRole("button", { name: "Let's build a town" })
              .waitFor();
            await page.evaluate(
              async ({ valid, future, invalidBackend }) => {
                const db = await new Promise((resolve, reject) => {
                  const request = indexedDB.open("baytown-builder", 1);
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
                await new Promise((resolve, reject) => {
                  const tx = db.transaction("saves", "readwrite");
                  tx.objectStore("saves").put(
                    JSON.stringify(invalidBackend === "db" ? future : valid),
                    "auto",
                  );
                  tx.oncomplete = resolve;
                  tx.onerror = reject;
                });
                db.close();
                localStorage.setItem(
                  "baytown:auto",
                  JSON.stringify(invalidBackend === "local" ? future : valid),
                );
              },
              { valid: fixture, future, invalidBackend },
            );
            await page.reload();
            await page.waitForFunction(() => __baytown.getReady());
            assert.deepEqual(
              (await state(page)).objects,
              (await api(page, "validateSave", fixture)).objects,
            );
            await page
              .getByRole("button", { name: "Save and load", exact: true })
              .click();
            const downloadPromise = page.waitForEvent("download");
            await page
              .getByRole("button", { name: "Export preserved file 1" })
              .click();
            const download = await downloadPromise;
            assert.deepEqual(
              JSON.parse(await readFile(await download.path(), "utf8")),
              future,
            );
          } finally {
            await context.close();
          }
        }
      },
    );

    await t.test(
      "reduced motion, denied storage, genuine touch input and multi-touch camera gesture",
      { timeout: 30000 },
      async () => {
        const context = await browser.newContext({
          viewport: { width: 768, height: 1024 },
          isMobile: true,
          hasTouch: true,
          reducedMotion: "reduce",
        });
        try {
          await context.addInitScript(() => {
            Storage.prototype.setItem = function () {
              throw new DOMException(
                "Storage unavailable",
                "QuotaExceededError",
              );
            };
            Object.defineProperty(window, "indexedDB", {
              value: {
                open() {
                  throw new Error("Storage unavailable");
                },
              },
            });
          });
          const page = await context.newPage();
          await page.goto(url);
          await page.getByRole("button", { name: /A blank canvas/ }).click();
          await page
            .getByRole("button", { name: "Let's build a town" })
            .click();
          await page.waitForFunction(() => __baytown.getReady());
          assert.equal(await api(page, "saveKey", "auto"), false);
          assert.match(
            await page.locator("#save-status").innerText(),
            /Storage full/,
          );
          await api(page, "setView", 38, 36, 20);
          await choose(page, "Bay cottage");
          const p = await api(page, "worldToScreen", 38, 35);
          await page.touchscreen.tap(p.x, p.y);
          assert.equal((await state(page)).objects.length, 1);
          const before = await page.evaluate(() => ({ ...__baytown.camera }));
          const cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: 330, y: 510, id: 1 },
              { x: 420, y: 510, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: 300, y: 490, id: 1 },
              { x: 460, y: 490, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          const after = await page.evaluate(() => ({ ...__baytown.camera }));
          assert.ok(after.zoom < before.zoom);
          assert.equal(
            (await state(page)).objects.length,
            1,
            "pinching with a tool must never place another building",
          );
          await page
            .getByRole("button", { name: "Town settings", exact: true })
            .click();
          assert.match(
            await page.locator("#dialog").innerText(),
            /Reduced · follows device/,
          );
        } finally {
          await context.close();
        }
      },
    );
  },
);

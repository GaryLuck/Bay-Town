"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const context = vm.createContext({});
vm.runInContext(
  html
    .split("/* CELEBRATION_CORE_START */")[1]
    .split("/* CELEBRATION_CORE_END */")[0] +
    ";globalThis.C={planParade,sampleParade,GIFT_GLYPHS,SKY_MESSAGE,PARTY_LIMITS};",
  context,
);
const C = context.C;
test("skywriting glyphs spell the real Ethan message with bounded seven-row geometry", () => {
  assert.equal(C.SKY_MESSAGE, "GO ETHAN!");
  let dots = 0;
  for (const letter of C.SKY_MESSAGE) {
    const rows = C.GIFT_GLYPHS[letter];
    assert.equal(rows.length, 7);
    for (const row of rows) {
      assert.ok(row >= 0 && row <= 31);
      dots += row.toString(2).replace(/0/g, "").length;
    }
  }
  assert.ok(dots > 75 && dots < 200);
});
test("parade plans a connected road route, chooses a useful component, and never wraps rows", () => {
  const mask = new Uint8Array(64),
    out = new Int16Array(64),
    parent = new Int16Array(64),
    queue = new Int16Array(64);
  mask[0] = 1;
  for (let x = 0; x < 8; x++) mask[3 * 8 + x] = 1;
  for (let z = 4; z < 7; z++) mask[z * 8 + 7] = 1;
  const length = C.planParade(mask, out, parent, queue, 8);
  assert.ok(length >= 8);
  for (let i = 0; i < length; i++) {
    assert.equal(mask[out[i]], 1);
    if (i)
      assert.equal(
        Math.abs((out[i] % 8) - (out[i - 1] % 8)) +
          Math.abs(Math.floor(out[i] / 8) - Math.floor(out[i - 1] / 8)),
        1,
      );
  }
  const fragmented = new Uint8Array(64);
  for (const i of [7, 8, 15, 16, 23, 24]) fragmented[i] = 1;
  assert.equal(C.planParade(fragmented, out, parent, queue, 8), 0);
  mask.fill(0);
  assert.equal(C.planParade(mask, out, parent, queue, 8), 0);
});
test("a compact larger road grid cannot hide a usable smaller parade route", () => {
  const width = 12,
    mask = new Uint8Array(144),
    out = new Int16Array(144),
    parent = new Int16Array(144),
    queue = new Int16Array(144);
  for (let z = 0; z < 3; z++)
    for (let x = 0; x < 3; x++) mask[z * width + x] = 1;
  for (let x = 5; x < 11; x++) mask[8 * width + x] = 1;
  const n = C.planParade(mask, out, parent, queue, width);
  assert.equal(n, 6);
  for (let i = 0; i < n; i++) assert.equal(Math.floor(out[i] / width), 8);
});
test("parade sampling follows corners, bridge elevations and continuous return journeys", () => {
  const route = Int16Array.from([24, 25, 26, 34, 42, 43]),
    heights = new Float32Array(64),
    pose = new Float32Array(4);
  heights.fill(0.11);
  heights[34] = 0.28;
  assert.equal(C.sampleParade(route, 6, heights, 2.5, pose, 8), true);
  assert.equal(pose[0], 2);
  assert.equal(pose[2], 3.5);
  assert.ok(Math.abs(pose[1] - 0.195) < 1e-6);
  const a = new Float32Array(4),
    b = new Float32Array(4);
  for (const turn of [1, 2, 3, 4, 5, 10]) {
    C.sampleParade(route, 6, heights, turn - 0.001, a, 8);
    C.sampleParade(route, 6, heights, turn + 0.001, b, 8);
    assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.003);
  }
  assert.equal(C.sampleParade(route, 0, heights, 0, pose, 8), false);
});
test("Ethan Tower and giraffe garden use real utility, workforce and service rules", () => {
  const defs = vm.runInNewContext(
    "(" + html.match(/const DEFS = (\{[\s\S]*?\n      \});/)[1] + ")",
  );
  const ctx = vm.createContext({ DEFS: defs });
  vm.runInContext(
    html
      .split(
        "/* SIMULATION_CORE_START — also exercised directly by the seeded tests. */",
      )[1]
      .split("/* SIMULATION_CORE_END */")[0] +
      ";globalThis.S={analyzeCity,initializeEconomy};",
    ctx,
  );
  const s = { mode: "empty", money: 30000, objects: [] };
  let id = 1;
  const add = (type, x, z, extra = {}) => {
    const o = { id: id++, type, x, z, rotation: 0, paid: 0, ...extra };
    s.objects.push(o);
    return o;
  };
  for (let x = 10; x <= 30; x++) add("road", x, 20);
  const home = add("cottage", 13, 18),
    tower = add("ethantower", 16, 17),
    garden = add("giraffegarden", 10, 16);
  add("wind", 10, 21);
  add("water", 14, 21);
  ctx.S.initializeEconomy(s);
  home.residents = 4;
  const a = ctx.S.analyzeCity(s);
  assert.equal(a.records[tower.id].jobs, 16);
  assert.equal(a.records[tower.id].staff, 2);
  assert.equal(a.records[tower.id].income, 24);
  assert.equal(a.records[tower.id].upkeep, 20);
  assert.equal(a.records[garden.id].upkeep, 4);
  assert.ok(
    a.records[home.id].services.some(
      (e) => e.type === "giraffegarden" && e.bonus === 12,
    ),
  );
  tower.damaged = true;
  assert.equal(ctx.S.analyzeCity(s).records[tower.id].income, 12);
});

test(
  "Milestone 6 real iPad celebrations, landmarks and old saves",
  { timeout: 150000 },
  async (t) => {
    const server = http.createServer((q, r) => {
      r.setHeader("Content-Type", "text/html");
      r.end(html);
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    try {
      for (const [name, width, height] of [
        ["portrait", 768, 1024],
        ["landscape", 1024, 768],
      ])
        await t.test(name, async () => {
          const ctx = await browser.newContext({
              viewport: { width, height },
              hasTouch: true,
              isMobile: true,
            }),
            page = await ctx.newPage(),
            errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.goto(`http://127.0.0.1:${server.address().port}`);
          await page
            .getByRole("button", { name: "Let's build a town" })
            .click();
          await page.waitForFunction(() => __baytown.getReady());
          await page.evaluate(() => __baytown.setPaused(true));
          await page
            .getByRole("button", { name: "Town settings", exact: true })
            .click();
          await page.locator("#ethan-corner").click();
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: path.join(root, `screenshots/ethan-corner-ipad-${name}.png`),
          });
          await page.locator("#gift-tower").click();
          assert.equal(
            await page.evaluate(() => __baytown.selected),
            "ethantower",
          );
          // Use the regular paid placement, refund and undo paths, retaining old towns unchanged.
          await page.evaluate(() => __baytown.drawPath("road", 43, 30, 43, 36));
          const funds = await page.evaluate(() => __baytown.state.money);
          assert.equal(
            await page.evaluate(() => __baytown.place("ethantower", 43, 27)),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            funds - 6000,
          );
          assert.equal(
            await page.evaluate(() => __baytown.place("giraffegarden", 47, 27)),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            funds - 7800,
          );
          assert.equal(
            await page.evaluate(() => __baytown.place("remove", 43, 27)),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            funds - 1800,
          );
          assert.equal(await page.evaluate(() => __baytown.undo()), true);
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            funds - 7800,
          );
          const before = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          await page.evaluate(() => {
            __baytown.selectTool(null);
            __baytown.setView(42, 32, 31);
            __baytown.life.lighting("day");
          });
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: path.join(
              root,
              `screenshots/ethan-landmarks-ipad-${name}.png`,
            ),
          });
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.start("sky")),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.start("parade")),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.start("parade")),
            false,
          );
          await page.evaluate(() => __baytown.celebrations.step(22));
          await page.waitForFunction(
            () => __baytown.celebrations.info().skyDots > 75,
          );
          const party = await page.evaluate(() =>
            __baytown.celebrations.info(),
          );
          assert.ok(party.routeLength >= 6);
          assert.ok(party.instances < 500);
          assert.ok(party.skyDots < 200);
          assert.equal(
            await page.locator("#celebration-banner").isVisible(),
            true,
          );
          const paused = party.skyAge;
          await page.waitForTimeout(250);
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().skyAge),
            paused,
          );
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: path.join(
              root,
              `screenshots/ethan-celebration-ipad-${name}.png`,
            ),
          });
          const during = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          assert.equal(during.money, before.money);
          assert.deepEqual(during.objects, before.objects);
          assert.deepEqual(during.claimedGoals, before.claimedGoals);
          assert.equal(during.version, 5);
          assert.equal(Object.hasOwn(during, "celebrations"), false);
          // Check route masks, active GPU recovery, and a modal-held clock.
          const routeOK = await page.evaluate(() => {
            const a = __baytown.celebrations.route,
              n = __baytown.celebrations.info().routeLength;
            for (let i = 0; i < n; i++)
              if (!__baytown.life.graph.drive[a[i]]) return false;
            return true;
          });
          assert.equal(routeOK, true);
          await page.evaluate(() => {
            window.__partyLoss = __baytown
              .getGL()
              .getExtension("WEBGL_lose_context");
            __partyLoss.loseContext();
          });
          await page.waitForTimeout(120);
          await page.evaluate(() => __partyLoss.restoreContext());
          await page.waitForFunction(
            () =>
              __baytown.getReady() &&
              __baytown.celebrations.info().instances > 0,
          );
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().skyAge),
            paused,
          );
          await page.evaluate(() =>
            __baytown.interior.enter(
              __baytown.state.objects.find((o) => o.type === "cottage").id,
            ),
          );
          await page.setViewportSize({ width: height, height: width });
          await page.waitForTimeout(100);
          await page.evaluate(() => __baytown.interior.leave());
          await page.waitForTimeout(100);
          const refit = await page.evaluate(() => {
            const i = __baytown.celebrations.info(),
              a = __baytown.camera.angle,
              dx = i.skyWidth / 2;
            const left = __baytown.worldToScreen(
                i.anchorX - Math.cos(a) * dx,
                i.anchorZ + Math.sin(a) * dx,
                i.skyAltitude,
              ).x,
              right = __baytown.worldToScreen(
                i.anchorX + Math.cos(a) * dx,
                i.anchorZ - Math.sin(a) * dx,
                i.skyAltitude,
              ).x;
            return {
              left,
              right,
              guide: document.querySelector(".journal").getBoundingClientRect()
                .right,
              controls: document
                .querySelector(".camera-controls")
                .getBoundingClientRect().left,
            };
          });
          assert.ok(refit.left > refit.guide && refit.right < refit.controls);
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().skyAge),
            paused,
          );
          await page.setViewportSize({ width, height });
          await page.evaluate(() => __baytown.setPaused(false));
          await page.waitForFunction(
            (p) => __baytown.celebrations.info().skyAge > p,
            paused,
          );
          await page
            .getByRole("button", { name: "Town settings", exact: true })
            .click();
          const notebook = await page.evaluate(
            () => __baytown.celebrations.info().skyAge,
          );
          await page.waitForTimeout(200);
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().skyAge),
            notebook,
          );
          await page
            .getByRole("button", { name: "Close dialog", exact: true })
            .click();
          await page.evaluate(() => __baytown.setPaused(true));
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.waitForFunction(() => __baytown.celebrations.info().quiet);
          const still = await page.evaluate(() =>
            __baytown.celebrations.info(),
          );
          await page.evaluate(() => __baytown.celebrations.step(1));
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().skyTime),
            still.skyTime,
          );
          await page.waitForTimeout(100);
          assert.ok(
            await page.evaluate(
              () => __baytown.celebrations.info().skyDots > 75,
            ),
          );
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.waitForFunction(
            () => !__baytown.celebrations.info().quiet,
          );
          await page.evaluate(() => __baytown.life.motion("still"));
          const quiet = await page.evaluate(
            () => __baytown.celebrations.info().paradeTime,
          );
          await page.evaluate(() => __baytown.celebrations.step(1));
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().paradeTime),
            quiet,
          );
          await page.evaluate(() => __baytown.life.motion("lively"));
          // Removing a used path ends a parade before it can walk through the edited tile.
          await page.evaluate(() => {
            const ix = __baytown.celebrations.route[0];
            __baytown.place("remove", ix % 72, Math.floor(ix / 72));
          });
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().parade),
            false,
          );
          await page.locator("#stop-celebration").click();
          assert.equal(
            await page.locator("#celebration-banner").isVisible(),
            false,
          );
          await page.evaluate(() => {
            __baytown.celebrations.start("sky");
            __baytown.celebrations.step(45);
          });
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().sky),
            false,
          );
          // Old fixtures and the furnished v5 fixture preserve their actual objects.
          for (const v of [1, 2, 3, 4, 5]) {
            const fixture = require(`./fixtures/v${v}.json`);
            const saved = await page.evaluate(
              (f) => __baytown.validateSave(f),
              fixture,
            );
            assert.equal(saved.version, 5);
            assert.equal(saved.objects.length, fixture.objects.length);
            assert.equal(saved.money, fixture.money);
          }
          await page.evaluate(() => __baytown.saveKey("slot2"));
          const exported = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          await page.reload();
          await page.waitForFunction(() => __baytown.getReady());
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().sky),
            false,
          );
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().parade),
            false,
          );
          const reloaded = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          assert.deepEqual(reloaded.objects, exported.objects);
          // A launch at either extreme camera edge remains inside the close-up viewport.
          for (const edge of [-5, 77]) {
            await page.evaluate((edge) => {
              __baytown.setView(edge, edge, 10);
              __baytown.celebrations.start("sky");
              __baytown.celebrations.step(22);
            }, edge);
            await page.waitForFunction(
              () => __baytown.celebrations.info().skyDots > 75,
            );
            const box = await page.evaluate(() => {
              const i = __baytown.celebrations.info(),
                a = __baytown.camera.angle,
                p = __baytown.camera.pitch,
                dx = i.skyWidth / 2,
                dy = 6 * i.skyScale;
              return [-dx, dx].flatMap((x) =>
                [0, dy].map((y) =>
                  __baytown.worldToScreen(
                    i.anchorX + Math.cos(a) * x - Math.sin(a) * Math.sin(p) * y,
                    i.anchorZ - Math.sin(a) * x - Math.cos(a) * Math.sin(p) * y,
                    i.skyAltitude + Math.cos(p) * y,
                  ),
                ),
              );
            });
            assert.ok(
              box.every(
                (p) =>
                  p.x > 0 && p.x < width && p.y > 100 && p.y < height - 200,
              ),
              JSON.stringify({ edge, box, width, height }),
            );
            await page.evaluate(() => __baytown.celebrations.stop());
          }
          // No-road starts explain the requirement and do not start a partial parade.
          await page.evaluate(() => __baytown.makeTown("sandbox"));
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.start("parade")),
            false,
          );
          assert.equal(
            await page.evaluate(() => __baytown.celebrations.info().parade),
            false,
          );
          assert.deepEqual(errors, []);
          await ctx.close();
        });
    } finally {
      await browser.close();
      await new Promise((r) => server.close(r));
    }
  },
);

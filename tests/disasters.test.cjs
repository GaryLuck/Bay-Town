"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { chromium } = require("playwright");
const html = fs.readFileSync(
  require("node:path").join(__dirname, "../index.html"),
  "utf8",
);
const vm = require("node:vm");
const core = html
  .split("/* DISASTER_CORE_START */")[1]
  .split("/* DISASTER_CORE_END */")[0];
const ctx = vm.createContext({ DEFS: { cottage: { size: 2 } } });
vm.runInContext(core, ctx);
for (const type of ["tornado", "earthquake", "meteor", "tsunami"])
  test(`${type}: exposure, service protection and safe paths`, () => {
    const o = { id: 1, type: "cottage", x: 48, z: 35 };
    const e = { type, x: 48, z: 35, serial: 1 };
    assert.equal(ctx.disasterExposed(o, e), true);
    assert.equal(ctx.disasterWillDamage(o, e, [o]), true);
    const service = {
      type: {
        tornado: "police",
        earthquake: "hospital",
        meteor: "fire",
        tsunami: "coastguard",
      }[type],
      x: 50,
      z: 35,
    };
    assert.equal(ctx.disasterProtection(o, e, [o, service]), 0.75);
    assert.equal(ctx.disasterExposed({ ...o, type: "road" }, e), false);
    assert.equal(ctx.disasterExposed({ ...o, x: 0, z: 0 }, e), false);
    if (type === "tsunami")
      assert.equal(
        ctx.disasterProtection(o, e, [o, { type: "seawall", x: 53, z: 35 }]),
        1,
      );
  });
test(
  "Milestone 4 real iPad browsers: adventures, recovery and version 3 saves",
  { timeout: 120000 },
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
          const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: true,
            isMobile: true,
          });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.goto(`http://127.0.0.1:${server.address().port}`);
          await page
            .getByRole("button", { name: "Let's build a town" })
            .click();
          await page.waitForFunction(() => __baytown.getReady());
          await page.evaluate(() => __baytown.setPaused(true));
          assert.equal(
            await page.evaluate(() => __baytown.disasters.start("tornado")),
            false,
          );
          for (const v of [1, 2, 3]) {
            const fixture = require(`./fixtures/v${v}.json`);
            const migrated = await page.evaluate(
              (f) => __baytown.validateSave(f),
              fixture,
            );
            assert.equal(migrated.version, 5);
            assert.equal(migrated.disasters.enabled, false);
          }
          // Exercise the touch-accessible settings flow, then keep time controlled for deterministic assertions.
          await page.locator("#menu-button").click();
          await page.locator("#open-disasters").click();
          await page.locator("#toggle-disasters").click();
          await page.locator('[data-disaster="tornado"]').click();
          assert.equal(
            await page.evaluate(() => __baytown.state.disasters.event.type),
            "tornado",
          );
          assert.equal(
            await page.locator("#disaster-banner").isVisible(),
            true,
          );
          const initial = await page.evaluate(
            () => __baytown.state.disasters.event.time,
          );
          await page.waitForTimeout(200);
          assert.equal(
            await page.evaluate(() => __baytown.state.disasters.event.time),
            initial,
          );
          assert.equal(
            await page.evaluate(() => __baytown.place("road", 40, 40)),
            false,
          );
          await page.evaluate(() => {
            __baytown.disasters.step(4);
          });
          assert.equal(
            await page.evaluate(
              () => __baytown.state.objects.filter((o) => o.damaged).length,
            ),
            0,
          );
          await page.evaluate(() => {
            __baytown.disasters.step(5);
            const e = __baytown.state.disasters.event;
            __baytown.setView(e.x - 5, e.z, 24);
          });
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(200);
          await page.screenshot({
            path: `screenshots/disaster-ipad-${name}.png`,
          });
          const midway = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          assert.ok(midway.disasters.event);
          assert.equal(
            await page.evaluate(
              (s) => __baytown.validateSave(s).disasters.event.time,
              midway,
            ),
            9,
          );
          await page.evaluate(() => __baytown.disasters.step(11));
          const uninterrupted = await page.evaluate(() =>
            __baytown.state.objects.filter((o) => o.damaged).map((o) => o.id),
          );
          await page.evaluate(async (s) => {
            await __baytown.applySave(s);
            __baytown.disasters.step(11);
          }, midway);
          assert.deepEqual(
            await page.evaluate(() =>
              __baytown.state.objects.filter((o) => o.damaged).map((o) => o.id),
            ),
            uninterrupted,
          );
          const result = await page.evaluate(() => ({
            objects: __baytown.state.objects,
            event: __baytown.state.disasters.event,
          }));
          assert.equal(result.event, null);
          assert.ok(result.objects.some((o) => o.damaged));
          const damaged = result.objects.find((o) => o.damaged);
          const before = await page.evaluate(() => __baytown.state.money);
          assert.equal(
            await page.evaluate(
              (id) => __baytown.disasters.repair(id),
              damaged.id,
            ),
            true,
          );
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            before -
              Math.ceil(
                (await page.evaluate(
                  (type) => __baytown.defs[type].cost,
                  damaged.type,
                )) * 0.25,
              ),
          );
          assert.equal(
            await page.evaluate(
              (id) => __baytown.disasters.repair(id),
              damaged.id,
            ),
            false,
          );
          const repaired = await page.evaluate(
            (id) => __baytown.state.objects.find((o) => o.id === id),
            damaged.id,
          );
          assert.equal(repaired.damaged, undefined);
          assert.equal(repaired.residents, damaged.residents);
          assert.equal(repaired.level, damaged.level);
          const economics = await page.evaluate(() => {
            const source = __baytown.state.objects.find(
              (o) => o.type === "wind",
            );
            source.damaged = false;
            const full = __baytown.analyzeCity(__baytown.state).summary
              .powerSupply;
            source.damaged = true;
            const half = __baytown.analyzeCity(__baytown.state).summary
              .powerSupply;
            return { full, half };
          });
          assert.equal(economics.half, economics.full / 2);
          // Each event completes; core tests separately verify coastal targets and walls.
          for (const type of ["earthquake", "meteor", "tsunami"]) {
            await page.evaluate((type) => {
              __baytown.state.disasters.enabled = true;
              __baytown.disasters.start(type);
              __baytown.disasters.step(20);
            }, type);
            assert.equal(
              await page.evaluate(() => __baytown.state.disasters.event),
              null,
            );
          }
          await page.evaluate(() => {
            __baytown.disasters.start("earthquake");
            __baytown.disasters.show();
          });
          await page.locator("#stop-disaster").click();
          assert.equal(
            await page.evaluate(() => __baytown.state.disasters.event),
            null,
          );
          assert.equal(
            await page.locator("#disaster-banner").isVisible(),
            false,
          );
          await page.evaluate(() => __baytown.disasters.show());
          await page.locator("#toggle-disasters").click();
          assert.equal(
            await page.locator('[data-disaster="tornado"]').isDisabled(),
            true,
          );
          await page.getByRole("button", { name: "Close dialog" }).click();
          await page.evaluate(() => {
            __baytown.makeTown("sandbox");
            __baytown.setPaused(true);
            __baytown.place("mountain", 40, 35);
          });
          const mountain = await page.evaluate(() =>
            __baytown.state.objects.find((o) => o.type === "mountain"),
          );
          assert.equal(
            await page.evaluate(
              (id) => __baytown.disasters.dynamite(id),
              mountain.id,
            ),
            true,
          );
          assert.equal(await page.evaluate(() => __baytown.undo()), true);
          assert.ok(
            await page.evaluate(() =>
              __baytown.state.objects.some((o) => o.type === "mountain"),
            ),
          );
          // Strict validation rejects damaged flags and corrupt event state without touching the town.
          for (const patch of [
            {
              enabled: true,
              event: { type: "volcano", time: 2, x: 40, z: 35, serial: 1 },
              serial: 1,
            },
            { enabled: false, event: null, serial: -1 },
          ])
            assert.equal(
              await page.evaluate((p) => {
                const s = JSON.parse(__baytown.serialize());
                s.disasters = p;
                try {
                  __baytown.validateSave(s);
                  return false;
                } catch {
                  return true;
                }
              }, patch),
              true,
            );
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.evaluate(() => {
            __baytown.state.disasters.enabled = true;
            __baytown.disasters.start("meteor");
            __baytown.disasters.step(7);
          });
          await page.waitForTimeout(100);
          const glok = await page.evaluate(async () => {
            const g = __baytown.getGL();
            const ext = g.getExtension("WEBGL_lose_context");
            ext.loseContext();
            await new Promise((r) => setTimeout(r, 100));
            ext.restoreContext();
            await new Promise((r) => setTimeout(r, 400));
            return (
              __baytown.getReady() &&
              __baytown.state.disasters.event.type === "meteor"
            );
          });
          assert.equal(glok, true);
          assert.deepEqual(errors, []);
          await context.close();
        });
    } finally {
      await browser.close();
      await new Promise((r) => server.close(r));
    }
  },
);

"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ctx = vm.createContext({});
vm.runInContext(
  html
    .split("/* INTERIOR_CORE_START */")[1]
    .split("/* INTERIOR_CORE_END */")[0] +
    "\nglobalThis.core={ROOM_SIZES,FURNITURE,ROOM_LIMITS,defaultRoom,roomPlacement,roomCanStand,moveRoomWalker,validateRoom,furnitureWidth,furnitureDepth};",
  ctx,
);
const C = ctx.core;
function empty() {
  return { wall: 0, floor: 0, items: [] };
}
test("30 furniture choices and all five default rooms fit and validate", () => {
  assert.equal(Object.keys(C.FURNITURE).length, 30);
  for (const type of Object.keys(C.ROOM_SIZES)) {
    const room = C.defaultRoom(type);
    assert.equal(C.validateRoom(type, room), 4);
    const [w, d] = C.ROOM_SIZES[type];
    assert.equal(C.roomCanStand(type, room, w / 2, d - 0.55), true);
  }
  for (const type of Object.keys(C.FURNITURE)) {
    const room = empty();
    room.items.push({ id: 1, type, x: 0, z: 0, rotation: 0 });
    assert.equal(C.validateRoom("villa", room), 1);
  }
});
test("rotation, occupied space, door clearance and rugs under furniture", () => {
  const room = empty();
  const sofa = { id: 1, type: "sofa", x: 0, z: 0, rotation: 1 };
  assert.equal(C.furnitureWidth(sofa), 1);
  assert.equal(C.furnitureDepth(sofa), 2);
  room.items.push(sofa);
  assert.match(
    C.roomPlacement("cottage", room, {
      id: 2,
      type: "plant",
      x: 0,
      z: 1,
      rotation: 0,
    }),
    /already/,
  );
  assert.equal(
    C.roomPlacement("cottage", room, {
      id: 2,
      type: "rug",
      x: 0,
      z: 0,
      rotation: 0,
    }),
    "",
  );
  assert.match(
    C.roomPlacement("cottage", room, {
      id: 2,
      type: "chair",
      x: 3,
      z: 5,
      rotation: 0,
    }),
    /door/,
  );
  assert.match(
    C.roomPlacement("cottage", room, {
      id: 2,
      type: "bed",
      x: 5,
      z: 0,
      rotation: 0,
    }),
    /inside/,
  );
});
test("walking slides along furniture and never tunnels through walls or obstacles", () => {
  const room = empty();
  room.items = [{ id: 1, type: "sofa", x: 2, z: 2, rotation: 0 }];
  const a = { x: 3, z: 4, yaw: 0 };
  for (let n = 0; n < 100; n++)
    C.moveRoomWalker("cottage", room, a, 0, 1, 0.25);
  assert.ok(a.z >= 3.22);
  assert.equal(C.roomCanStand("cottage", room, a.x, a.z), true);
  for (let n = 0; n < 100; n++)
    C.moveRoomWalker("cottage", room, a, 1, 1, 0.25);
  assert.ok(a.x <= 5.78);
  assert.ok(a.z >= 0.22);
  const b = { x: 3, z: 4, yaw: 0 };
  const c = { ...b };
  C.moveRoomWalker("cottage", empty(), b, 0, 1, 0.2);
  C.moveRoomWalker("cottage", empty(), c, 1, 1, 0.2);
  assert.ok(
    Math.abs(Math.hypot(b.x - 3, b.z - 4) - Math.hypot(c.x - 3, c.z - 4)) <
      1e-10,
  );
});
test("malformed room fields, unknown pieces, overlaps and oversized rooms are rejected", () => {
  const good = C.defaultRoom("cottage");
  for (const bad of [
    { ...good, wall: 8 },
    { ...good, floor: -1 },
    {
      ...good,
      items: [{ id: 1, type: "constructor", x: 0, z: 0, rotation: 0 }],
    },
    { ...good, items: [...good.items, { ...good.items[0] }] },
    { ...good, items: [{ ...good.items[0], rotation: 4 }] },
    { ...good, items: [{ ...good.items[0], x: 0.5 }] },
    {
      ...good,
      items: Array.from({ length: 41 }, (_, i) => ({
        ...good.items[0],
        id: i + 1,
      })),
    },
  ])
    assert.throws(() => C.validateRoom("cottage", bad));
  assert.throws(() => C.validateRoom("road", good));
});

test(
  "milestone 5 real iPad rooms, touch walking, decorating and saved interiors",
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
          const before = await page.evaluate(() => ({
            camera: { ...__baytown.camera },
            day: __baytown.state.day,
            phase: __baytown.state.dayProgress,
            money: __baytown.state.money,
            home: __baytown.state.objects.find((o) => o.type === "cottage"),
          }));
          // Reach the actual inspector with a real map tap.
          await page.evaluate((h) => {
            __baytown.selectTool(null);
            __baytown.setView(h.x, h.z, 20);
          }, before.home);
          const point = await page.evaluate(
            (h) => __baytown.worldToScreen(h.x + 0.5, h.z + 0.5),
            before.home,
          );
          await page.touchscreen.tap(point.x, point.y);
          await page
            .getByRole("button", { name: "Come inside", exact: true })
            .click();
          await page.waitForFunction(() => __baytown.interior.session);
          const entry = await page.evaluate(() => ({
            camera: { ...__baytown.camera },
            day: __baytown.state.day,
            phase: __baytown.state.dayProgress,
            walker: {
              x: __baytown.interior.session.x,
              z: __baytown.interior.session.z,
            },
          }));
          await page.waitForTimeout(250);
          assert.equal(
            await page.evaluate(() => __baytown.state.dayProgress),
            entry.phase,
          );
          assert.equal(await page.locator(".build-dock").isVisible(), false);
          // A held touch move and a concurrent drag-to-look use independent pointers.
          const cdp = await context.newCDPSession(page);
          const forward = await page
            .getByRole("button", { name: "Walk forward", exact: true })
            .boundingBox();
          const fx = forward.x + forward.width / 2,
            fy = forward.y + forward.height / 2;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: fx, y: fy, id: 1 }],
          });
          await page.waitForTimeout(150);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: fx, y: fy, id: 1 },
              { x: width * 0.6, y: height * 0.4, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: fx, y: fy, id: 1 },
              { x: width * 0.6 + 50, y: height * 0.4 - 20, id: 2 },
            ],
          });
          await page.waitForTimeout(200);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.ok(
            await page.evaluate(
              (z) => __baytown.interior.session.z < z,
              entry.walker.z,
            ),
          );
          assert.ok(
            await page.evaluate(() => __baytown.interior.session.yaw > 0),
          );
          const yaw = await page.evaluate(() => __baytown.interior.session.yaw);
          await page.mouse.move(width * 0.55, height * 0.4);
          await page.mouse.down();
          await page.mouse.move(width * 0.55 + 70, height * 0.4 - 20, {
            steps: 5,
          });
          await page.mouse.up();
          assert.ok(
            await page.evaluate((y) => __baytown.interior.session.yaw > y, yaw),
          );
          await page.keyboard.down("w");
          await page.waitForTimeout(150);
          await page.keyboard.up("w");
          await page.evaluate(() => {
            __baytown.interior.session.x = 3;
            __baytown.interior.session.z = 5.4;
            __baytown.interior.session.yaw = 0;
            __baytown.interior.move(0, 0, 0);
          });
          await page.waitForTimeout(100);
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: path.join(root, `screenshots/interior-walk-ipad-${name}.png`),
          });
          await page
            .getByRole("button", { name: "Decorate", exact: true })
            .click();
          await page.waitForFunction(
            () => __baytown.interior.session.mode === "decorate",
          );
          // Place via catalog and floor picking, then select, rotate and move the same piece.
          await page.locator('[data-furniture="chair"]').click();
          let floor = await page.evaluate(() =>
            __baytown.worldToScreen(4.5, 2.5),
          );
          await page.touchscreen.tap(floor.x, floor.y);
          const chair = await page.evaluate(() =>
            __baytown.interior.room.items.find((o) => o.type === "chair"),
          );
          assert.ok(chair);
          assert.equal(chair.x, 4);
          assert.equal(chair.z, 2);
          await page.locator("#room-turn").click();
          assert.equal(
            await page.evaluate(
              (id) =>
                __baytown.interior.room.items.find((o) => o.id === id).rotation,
              chair.id,
            ),
            1,
          );
          await page.locator("#room-move").click();
          floor = await page.evaluate(() => __baytown.worldToScreen(4.5, 3.5));
          await page.touchscreen.tap(floor.x, floor.y);
          assert.equal(
            await page.evaluate(
              (id) => __baytown.interior.room.items.find((o) => o.id === id).z,
              chair.id,
            ),
            3,
          );
          await page.locator("#room-remove").click();
          assert.equal(
            await page.evaluate(
              (id) => __baytown.interior.room.items.some((o) => o.id === id),
              chair.id,
            ),
            false,
          );
          await page
            .getByRole("button", { name: "Room undo", exact: true })
            .click();
          assert.equal(
            await page.evaluate(
              (id) => __baytown.interior.room.items.some((o) => o.id === id),
              chair.id,
            ),
            true,
          );
          const count = await page.evaluate(
            () => __baytown.interior.room.items.length,
          );
          assert.equal(
            await page.evaluate(() => __baytown.interior.place("bed", 5, 5)),
            false,
          );
          assert.equal(
            await page.evaluate(() => __baytown.interior.room.items.length),
            count,
          );
          await page.locator("#room-paint").click();
          await page.locator('[data-surface="wall"][data-paint="4"]').click();
          await page.locator('[data-surface="floor"][data-paint="1"]').click();
          await page
            .getByRole("button", { name: "Close dialog", exact: true })
            .click();
          assert.equal(
            await page.evaluate(() => __baytown.interior.room.wall),
            4,
          );
          assert.equal(
            await page.evaluate(() => __baytown.interior.room.floor),
            1,
          );
          await page.waitForFunction(
            () => !document.getElementById("toast").classList.contains("show"),
          );
          await page.waitForTimeout(250);
          await page.screenshot({
            path: path.join(
              root,
              `screenshots/interior-decorate-ipad-${name}.png`,
            ),
          });
          // WebGL restoration retains the active view and exact room data.
          const room = await page.evaluate(() => __baytown.interior.room);
          await page.evaluate(() => {
            window.__roomLoss = __baytown
              .getGL()
              .getExtension("WEBGL_lose_context");
            window.__roomLoss.loseContext();
          });
          await page.waitForTimeout(150);
          await page.evaluate(() => window.__roomLoss.restoreContext());
          await page.waitForFunction(() => __baytown.getReady());
          assert.deepEqual(
            await page.evaluate(() => __baytown.interior.room),
            room,
          );
          await page.locator("#room-save").click();
          const downloadPromise = page.waitForEvent("download");
          await page.locator("#export-town").click();
          const download = await downloadPromise;
          const file = JSON.parse(
            fs.readFileSync(await download.path(), "utf8"),
          );
          assert.deepEqual(
            file.objects.find((o) => o.id === before.home.id).interior,
            room,
          );
          await page
            .getByRole("button", { name: "Close dialog", exact: true })
            .click();
          // Town data and camera do not inherit the first-person view.
          await page
            .getByRole("button", { name: "Back to town", exact: true })
            .click();
          assert.deepEqual(
            await page.evaluate(() => ({ ...__baytown.camera })),
            entry.camera,
          );
          assert.equal(
            await page.evaluate(() => __baytown.state.money),
            before.money,
          );
          await page.evaluate(() => __baytown.setPaused(true));
          await page.evaluate(() => __baytown.saveKey("slot1"));
          const exported = await page.evaluate(() =>
            JSON.parse(__baytown.serialize()),
          );
          assert.equal(exported.version, 4);
          await page.reload();
          await page.waitForFunction(() => __baytown.getReady());
          assert.equal(
            await page.evaluate(() => __baytown.interior.session),
            null,
          );
          await page.evaluate(
            (id) => __baytown.interior.enter(id),
            before.home.id,
          );
          assert.deepEqual(
            await page.evaluate(() => __baytown.interior.room),
            room,
          );
          // All old fixtures migrate, a furnished v4 fixture validates, corrupt room imports are atomic.
          for (const v of [1, 2, 3, 4]) {
            const f = require(`./fixtures/v${v}.json`);
            assert.equal(
              await page.evaluate((f) => __baytown.validateSave(f).version, f),
              4,
            );
          }
          const current = await page.evaluate(() => __baytown.serialize());
          const corrupt = JSON.parse(current);
          corrupt.objects.find((o) => o.id === before.home.id).interior.wall =
            99;
          assert.equal(
            await page.evaluate(async (f) => {
              try {
                await __baytown.applySave(f);
                return false;
              } catch {
                return true;
              }
            }, corrupt),
            true,
          );
          assert.deepEqual(
            await page.evaluate(() => __baytown.interior.room),
            room,
          );
          // Loading another town while inside closes the room only after successful validation/backup.
          await page.evaluate(
            (f) => __baytown.applySave(f),
            require("./fixtures/v1.json"),
          );
          assert.equal(
            await page.evaluate(() => __baytown.interior.session),
            null,
          );
          // Every home type opens, including a repair site; defaults and paint are independent.
          await page.evaluate(() => __baytown.makeTown("sandbox"));
          for (const [i, type] of [
            "cottage",
            "family",
            "townhouse",
            "apartment",
            "villa",
          ].entries()) {
            assert.equal(
              await page.evaluate(
                ({ i, type }) => __baytown.place(type, 25 + i * 5, 35),
                { i, type },
              ),
              true,
            );
            const id = await page.evaluate(
              (type) => __baytown.state.objects.find((o) => o.type === type).id,
              type,
            );
            if (type === "cottage")
              await page.evaluate((id) => {
                __baytown.state.objects.find((o) => o.id === id).damaged = true;
              }, id);
            assert.equal(
              await page.evaluate((id) => __baytown.interior.enter(id), id),
              true,
            );
            assert.equal(
              await page.evaluate(() => __baytown.interior.room.wall),
              0,
            );
            await page.evaluate(() => {
              __baytown.interior.paint("wall", 2);
              __baytown.interior.leave();
            });
          }
          // Context loss/reduced motion do not stop user-directed walking or lose decoration.
          await page.emulateMedia({ reducedMotion: "reduce" });
          assert.equal(
            await page.evaluate(() =>
              __baytown.interior.enter(
                __baytown.state.objects.find((o) => o.type === "villa").id,
              ),
            ),
            true,
          );
          const pos = await page.evaluate(() => __baytown.interior.session.z);
          await page
            .getByRole("button", { name: "Walk forward", exact: true })
            .click();
          assert.ok(
            await page.evaluate((z) => __baytown.interior.session.z < z, pos),
          );
          const targets = await page
            .locator("#room-ui button:visible")
            .evaluateAll((bs) =>
              bs.map((b) => ({
                w: b.getBoundingClientRect().width,
                h: b.getBoundingClientRect().height,
              })),
            );
          assert.ok(targets.every((r) => r.w >= 52 && r.h >= 52));
          if (name === "portrait") {
            const limits = await page.evaluate(async () => {
              __baytown.interior.leave();
              __baytown.makeTown("sandbox");
              __baytown.setPaused(true);
              for (let i = 0; i < 26; i++)
                if (
                  !__baytown.place(
                    "villa",
                    20 + (i % 6) * 4,
                    20 + Math.floor(i / 6) * 4,
                  )
                )
                  throw Error("Limit fixture did not fit");
              const saved = JSON.parse(__baytown.serialize());
              const full = {
                wall: 0,
                floor: 0,
                items: Array.from({ length: 40 }, (_, i) => ({
                  id: i + 1,
                  type: "plant",
                  x: i % 10,
                  z: Math.floor(i / 10),
                  rotation: 0,
                })),
              };
              for (let i = 0; i < 25; i++)
                saved.objects[i].interior = structuredClone(full);
              await __baytown.applySave(saved);
              const removed = __baytown.state.objects[0],
                last = __baytown.state.objects[25];
              __baytown.place("remove", removed.x, removed.z);
              __baytown.interior.enter(last.id);
              __baytown.interior.mode("decorate");
              for (let z = 0; z < 8; z++)
                for (let x = 0; x < 10; x++)
                  if (__baytown.interior.room.items.length < 40)
                    __baytown.interior.place("plant", x, z, 0);
              const extra = __baytown.interior.place("stool", 0, 0, 0);
              __baytown.interior.leave();
              const count = __baytown.state.objects.reduce(
                (n, o) => n + (o.interior?.items.length || 0),
                0,
              );
              const blocked = __baytown.undo();
              __baytown.validateSave(__baytown.serialize());
              __baytown.interior.enter(last.id);
              for (const id of __baytown.interior.room.items.map((o) => o.id))
                __baytown.interior.remove(id);
              __baytown.interior.leave();
              const retried = __baytown.undo();
              const readable = __baytown.validateSave(
                __baytown.serialize(),
              ).version;
              const oversized = JSON.parse(__baytown.serialize());
              oversized.objects.find((o) => o.id === last.id).interior = full;
              let rejected = false;
              try {
                __baytown.validateSave(oversized);
              } catch {
                rejected = true;
              }
              return { count, extra, blocked, retried, readable, rejected };
            });
            assert.deepEqual(limits, {
              count: 1000,
              extra: false,
              blocked: false,
              retried: true,
              readable: 4,
              rejected: true,
            });
          }
          assert.deepEqual(errors, []);
          await context.close();
        });
    } finally {
      await browser.close();
      await new Promise((r) => server.close(r));
    }
  },
);

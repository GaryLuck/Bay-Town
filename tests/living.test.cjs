"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const defs = vm.runInNewContext(
  "(" + html.match(/const DEFS = (\{[\s\S]*?\n      \});/)[1] + ")",
);
const core = html
  .split(
    "/* LIVING_CORE_START — shared by the renderer and routing tests. */",
  )[1]
  .split("/* LIVING_CORE_END */")[0];
const ctx = vm.createContext({});
vm.runInContext(
  core +
    ";globalThis.Life={buildLifeGraph,findLifeRoute,createLifePool,seedLifePool,stepLifePool,LIFE_LIMITS,LIFE_MAX,LIFE_PATH,placeLifeActor,planLifeRoute};",
  ctx,
);
const Life = ctx.Life;
function state() {
  return { seed: 81024, objects: [] };
}
function add(s, type, x, z, extra = {}) {
  const o = {
    id: s.objects.length + 1,
    type,
    x,
    z,
    rotation: 0,
    paid: 0,
    ...extra,
  };
  if (defs[type].capacity && !Object.hasOwn(extra, "residents"))
    o.residents = 4;
  s.objects.push(o);
  return o;
}
function route(g, kind, start, end) {
  const output = new Int16Array(5184),
    parent = new Int16Array(5184),
    queue = new Int16Array(5184);
  const mask = g[kind];
  const n = Life.findLifeRoute(mask, start, end, output, 0, parent, queue);
  return [...output.slice(0, n)];
}
function village(population = 11) {
  const s = state();
  for (let z = 20; z <= 38; z++) add(s, "road", 30, z);
  for (let x = 30; x <= 45; x++) add(s, "road", x, 29);
  add(s, "family", 28, 22, { residents: population });
  add(s, "market", 31, 26);
  add(s, "park", 33, 30);
  return s;
}
function ground() {
  return new Uint8Array(5184).fill(1);
}
function graph(s, land = ground()) {
  return Life.buildLifeGraph(s, land, defs);
}
function seeded(s, quality = "auto", land = ground()) {
  const g = graph(s, land),
    p = Life.createLifePool(s.seed);
  Life.seedLifePool(p, g, Life.LIFE_LIMITS[quality]);
  return { g, p };
}
function activeCells(p, i) {
  return [...p.routes.slice(i * 5184, i * 5184 + p.length[i])];
}

test("cars follow orthogonal roads and bridges; walkers and pets may also use docks", () => {
  const s = state();
  add(s, "road", 30, 20);
  add(s, "bridge", 31, 20);
  add(s, "dock", 32, 20);
  add(s, "dock", 33, 20);
  const g = graph(s);
  assert.deepEqual(route(g, "drive", 20 * 72 + 30, 20 * 72 + 31), [
    20 * 72 + 30,
    20 * 72 + 31,
  ]);
  assert.equal(route(g, "drive", 20 * 72 + 30, 20 * 72 + 33).length, 0);
  assert.equal(route(g, "walk", 20 * 72 + 30, 20 * 72 + 33).length, 4);
});
test("BFS routes respect disconnections, map boundaries and a long detour", () => {
  const s = state();
  for (let z = 10; z <= 20; z++) {
    add(s, "road", 10, z);
    add(s, "road", 20, z);
  }
  for (let x = 11; x < 20; x++) add(s, "road", x, 20);
  add(s, "road", 71, 30);
  add(s, "road", 0, 31);
  const g = graph(s);
  const path = route(g, "drive", 10 * 72 + 10, 10 * 72 + 20);
  assert.equal(path.length, 31);
  assert.equal(route(g, "drive", 30 * 72 + 71, 31 * 72).length, 0);
  assert.equal(route(g, "drive", -1, 0).length, 0);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    assert.equal(
      Math.abs((a % 72) - (b % 72)) +
        Math.abs(Math.floor(a / 72) - Math.floor(b / 72)),
      1,
    );
    assert.ok(g.drive[b]);
  }
});
test("actors start from occupied connected homes, not empty roads or an unreachable neighborhood", () => {
  const empty = state();
  for (let x = 10; x < 20; x++) add(empty, "road", x, 20);
  assert.equal(seeded(empty).p.count, 0);
  const s = village();
  add(s, "cottage", 50, 50, { residents: 4 });
  const { p, g } = seeded(s);
  assert.equal(p.count, 16);
  for (let i = 0; i < p.count; i++) {
    assert.ok(p.length[i] > 1);
    const mask = p.kind[i] === 0 ? g.drive : g.walk;
    for (const ix of activeCells(p, i)) assert.ok(mask[ix]);
  }
});
test("the same seed and town give identical colors, models, starts and routes", () => {
  const s = village(),
    a = seeded(s),
    b = seeded(s);
  assert.equal(a.p.count, b.p.count);
  for (const key of [
    "kind",
    "variant",
    "home",
    "length",
    "step",
    "progress",
    "speed",
    "x",
    "y",
    "z",
    "routes",
  ])
    assert.deepEqual([...a.p[key]], [...b.p[key]]);
  const changed = village();
  changed.seed = 42;
  const c = seeded(changed);
  assert.notDeepEqual(
    [...a.p.variant.slice(0, a.p.count)],
    [...c.p.variant.slice(0, c.p.count)],
  );
});
test("quality caps are enforced at large populations without unbounded actors", () => {
  for (const quality of ["low", "auto", "high"]) {
    const { p } = seeded(village(100000), quality),
      cap = Life.LIFE_LIMITS[quality],
      counts = [0, 0, 0, 0];
    for (let i = 0; i < p.count; i++) counts[p.kind[i]]++;
    assert.equal(counts[0], cap.cars);
    assert.equal(counts[1], cap.walkers);
    assert.equal(counts[2], cap.pets);
    assert.ok(p.count <= Life.LIFE_MAX);
  }
});
test("moving pools reuse all route and scratch buffers across many destinations", () => {
  const s = village(100),
    { p, g } = seeded(s, "high"),
    routes = p.routes,
    parent = p.parent,
    queue = p.queue,
    before = [...p.x.slice(0, p.count)];
  for (let i = 0; i < 1200; i++) Life.stepLifePool(p, g, 0.1, 3);
  assert.equal(p.routes, routes);
  assert.equal(p.parent, parent);
  assert.equal(p.queue, queue);
  assert.ok(p.arrivals > 50);
  assert.notDeepEqual([...p.x.slice(0, p.count)], before);
  for (let i = 0; i < p.count; i++) {
    assert.ok(
      Number.isFinite(p.x[i]) &&
        Number.isFinite(p.y[i]) &&
        Number.isFinite(p.z[i]),
    );
    const cells = activeCells(p, i),
      mask = p.kind[i] === 0 ? g.drive : g.walk;
    for (const ix of cells) assert.ok(mask[ix]);
    const x = Math.round(p.x[i]),
      z = Math.round(p.z[i]);
    assert.ok(mask[z * 72 + x]);
  }
});
test("removing a road rebuilds routes without stale references or actors crossing the gap", () => {
  const s = village(40);
  s.objects = s.objects.filter(
    (o) => !(o.type === "road" && o.x === 30 && o.z === 28),
  );
  const { p, g } = seeded(s);
  const gap = 28 * 72 + 30;
  assert.equal(g.drive[gap], 0);
  for (let n = 0; n < 100; n++) Life.stepLifePool(p, g, 0.2);
  for (let i = 0; i < p.count; i++)
    assert.equal(activeCells(p, i).includes(gap), false);
});
function portTown() {
  const s = state(),
    land = ground();
  for (let z = 0; z < 72; z++)
    for (let x = 40; x < 72; x++) land[z * 72 + x] = 0;
  add(s, "harbor", 37, 28);
  for (let x = 40; x <= 43; x++) add(s, "dock", x, 29);
  return { s, land };
}
test("a bridge fence blocks harbor access instead of allowing distance-based berth jumps", () => {
  const { s, land } = portTown();
  add(s, "road", 39, 27);
  add(s, "road", 39, 31);
  for (let x = 40; x <= 44; x++) {
    add(s, "bridge", x, 27);
    add(s, "bridge", x, 31);
  }
  for (let z = 28; z <= 30; z++) add(s, "bridge", 44, z);
  const { p, g } = seeded(s, "auto", land);
  assert.equal(g.harbors[0].hasDock, true);
  assert.equal(g.harbors[0].berths.length, 0);
  assert.equal(p.count, 0);
});
test("cars, walkers and pets move continuously through a corner", () => {
  const s = state();
  for (const [x, z] of [
    [10, 10],
    [11, 10],
    [11, 11],
  ])
    add(s, "road", x, z);
  const g = graph(s);
  for (const kind of [0, 1, 2]) {
    const p = Life.createLifePool(1);
    p.count = 1;
    p.kind[0] = kind;
    p.speed[0] = 0.5;
    p.length[0] = 3;
    p.routes.set([730, 731, 803]);
    p.progress[0] = 0.999;
    Life.placeLifeActor(p, g, 0);
    const x = p.x[0],
      z = p.z[0];
    Life.stepLifePool(p, g, 0.004, 0);
    assert.ok(Math.hypot(p.x[0] - x, p.z[0] - z) < 0.01);
  }
});
test("route reversals preserve the arrival position instead of switching sidewalks instantly", () => {
  const s = state();
  add(s, "road", 10, 10);
  add(s, "road", 11, 10);
  const g = graph(s),
    p = Life.createLifePool(1);
  p.count = 1;
  p.kind[0] = 1;
  p.speed[0] = 0.5;
  p.length[0] = 2;
  p.routes.set([730, 731]);
  p.progress[0] = 0.999;
  Life.placeLifeActor(p, g, 0);
  let x = p.x[0],
    z = p.z[0];
  Life.stepLifePool(p, g, 0.004, 1);
  assert.ok(Math.hypot(p.x[0] - x, p.z[0] - z) < 0.01);
  x = p.x[0];
  z = p.z[0];
  p.wait[0] = 0;
  Life.stepLifePool(p, g, 0.004, 0);
  assert.ok(Math.hypot(p.x[0] - x, p.z[0] - z) < 0.01);
});
test("ships require a harbor beside a connected dock with clear navigable water", () => {
  let { s, land } = portTown();
  let { p, g } = seeded(s, "auto", land);
  assert.equal(g.harbors[0].hasDock, true);
  assert.ok(g.harbors[0].berths.length);
  assert.equal(p.count, 2);
  assert.equal(p.kind[0], 3);
  s.objects = s.objects.filter((o) => o.type !== "dock");
  ({ p, g } = seeded(s, "auto", land));
  assert.equal(p.count, 0);
  assert.equal(g.harbors[0].hasDock, false);
  ({ s, land } = portTown());
  land.fill(1);
  for (let x = 40; x < 46; x++) land[29 * 72 + x] = 0;
  ({ p, g } = seeded(s, "auto", land));
  assert.equal(p.count, 0);
  assert.equal(g.harbors[0].berths.length, 0);
});
test("vessel routes keep hull clearance from land, piers, bridges and sea walls", () => {
  const { s, land } = portTown();
  for (let z = 10; z < 20; z++) add(s, "bridge", 52, z);
  add(s, "seawall", 48, 40);
  const { p, g } = seeded(s, "high", land);
  for (let n = 0; n < 1600; n++) Life.stepLifePool(p, g, 0.1, 3);
  assert.ok(p.arrivals > 2);
  for (let i = 0; i < p.count; i++) {
    assert.equal(p.kind[i], 3);
    for (const cell of activeCells(p, i)) {
      assert.ok(g.water[cell]);
      const x = cell % 72,
        z = Math.floor(cell / 72);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          assert.equal(land[(z + dz) * 72 + x + dx], 0);
    }
  }
});
test("decorative motion neither changes the save nor changes the economy", () => {
  const s = village(),
    before = JSON.stringify(s),
    { p, g } = seeded(s);
  for (let i = 0; i < 100; i++) Life.stepLifePool(p, g, 0.2);
  assert.equal(JSON.stringify(s), before);
  const snapshot = [...p.x];
  const time = p.motionTime;
  Life.stepLifePool(p, g, 0);
  assert.deepEqual([...p.x], snapshot);
  assert.equal(p.motionTime, time);
});

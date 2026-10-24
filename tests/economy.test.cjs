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
    "/* SIMULATION_CORE_START — also exercised directly by the seeded tests. */",
  )[1]
  .split("/* SIMULATION_CORE_END */")[0];
const context = vm.createContext({ DEFS: defs });
vm.runInContext(
  core +
    ";globalThis.Sim={analyzeCity,stepEconomy,initializeEconomy,homeCapacity,goalProgress,GOALS,SIM_RULES};",
  context,
);
const Sim = context.Sim;
function town() {
  const s = {
    version: 2,
    name: "Sim Bay",
    seed: 81024,
    mode: "empty",
    money: 30000,
    objects: [],
    created: 1,
    updated: 1,
  };
  Sim.initializeEconomy(s);
  return s;
}
function add(s, type, x, z, fields = {}) {
  const obj = {
    id: Math.max(0, ...s.objects.map((o) => o.id)) + 1,
    type,
    x,
    z,
    rotation: 0,
    paid: 0,
  };
  if (defs[type].capacity)
    Object.assign(obj, {
      residents: Math.ceil(defs[type].capacity / 2),
      level: 1,
      growth: 0,
    });
  Object.assign(obj, fields);
  s.objects.push(obj);
  return obj;
}
function line(s, x, z0, z1) {
  for (let z = z0; z <= z1; z++) add(s, "road", x, z);
}
function supplied() {
  const s = town();
  line(s, 10, 8, 24);
  add(s, "wind", 8, 8);
  add(s, "water", 8, 11);
  return s;
}
function clone(s) {
  return JSON.parse(JSON.stringify(s));
}
function record(view, obj) {
  return view.records[obj.id];
}

test("power and water require the same connected road network, including bridges", () => {
  const s = supplied(),
    a = add(s, "cottage", 11, 12, { residents: 4 });
  line(s, 30, 8, 24);
  const b = add(s, "cottage", 31, 12, { residents: 4 });
  let v = Sim.analyzeCity(s);
  assert.equal(record(v, a).efficiency, 1);
  assert.equal(record(v, b).power, 0);
  assert.equal(record(v, b).water, 0);
  assert.equal(record(v, b).efficiency, 0.5);
  for (let x = 11; x < 30; x++) add(s, x === 20 ? "bridge" : "road", x, 8);
  v = Sim.analyzeCity(s);
  assert.equal(v.networks.length, 1);
  assert.equal(record(v, b).efficiency, 1);
  assert.equal(v.summary.suppliedHomes, 2);
});
test("a dead-end road against another wall never disconnects an already supplied home", () => {
  const s = town();
  line(s, 14, 10, 14);
  const h = add(s, "cottage", 12, 10);
  add(s, "wind", 15, 10);
  add(s, "water", 15, 13);
  assert.equal(record(Sim.analyzeCity(s), h).efficiency, 1);
  add(s, "road", 11, 10);
  const r = record(Sim.analyzeCity(s), h);
  assert.equal(r.power, 1);
  assert.equal(r.water, 1);
  assert.equal(r.efficiency, 1);
});
test("docks are not utility lines and coordinate boundaries never wrap road connections", () => {
  const s = town();
  add(s, "road", 71, 10);
  add(s, "road", 0, 11);
  assert.equal(Sim.analyzeCity(s).networks.length, 2);
  const d = supplied();
  add(d, "dock", 11, 8);
  add(d, "road", 12, 8);
  add(d, "cottage", 13, 8);
  assert.equal(Sim.analyzeCity(d).networks.length, 2);
  assert.equal(Sim.analyzeCity(d).summary.suppliedHomes, 0);
});
test("finite capacity is shared fairly and one or two missing utilities means half strength", () => {
  const s = supplied();
  const homes = [
    add(s, "apartment", 11, 9, { residents: 32, level: 2 }),
    add(s, "apartment", 11, 13, { residents: 32, level: 2 }),
    add(s, "apartment", 11, 17, { residents: 32, level: 2 }),
  ];
  let v = Sim.analyzeCity(s);
  assert.equal(v.summary.demand, 96);
  assert.equal(v.networks[0].power, 80 / 96);
  assert.equal(v.networks[0].water, 1);
  assert.ok(homes.every((o) => record(v, o).efficiency === 0.5));
  assert.ok(
    homes.reduce((n, o) => n + o.residents * record(v, o).power, 0) <=
      80 + 1e-9,
  );
  add(s, "wind", 8, 15);
  v = Sim.analyzeCity(s);
  assert.ok(homes.every((o) => record(v, o).efficiency === 1));
  s.objects = s.objects.filter((o) => o.type !== "water" && o.type !== "wind");
  v = Sim.analyzeCity(s);
  assert.ok(homes.every((o) => record(v, o).efficiency === 0.5));
  assert.equal(v.summary.homeIncome, 96 * 8 * 0.5);
});
test("a source touching two networks shares capacity instead of duplicating it", () => {
  const s = town();
  line(s, 11, 8, 16);
  line(s, 14, 8, 16);
  add(s, "wind", 12, 10);
  add(s, "cottage", 9, 12);
  add(s, "cottage", 15, 12);
  const v = Sim.analyzeCity(s);
  assert.equal(v.networks.length, 2);
  assert.equal(v.summary.powerSupply, 80);
  assert.equal(v.networks[0].powerSupply, 40);
  assert.equal(v.networks[1].powerSupply, 40);
});
test("jobs are capped by connected working adults, including small disconnected populations", () => {
  const s = supplied();
  add(s, "cottage", 11, 9, { residents: 4 });
  add(s, "office", 11, 13);
  add(s, "factory", 11, 17);
  line(s, 30, 8, 16);
  const emptyOffice = add(s, "office", 31, 10);
  const v = Sim.analyzeCity(s);
  assert.equal(v.summary.adults, 2);
  assert.equal(v.summary.staff, 2);
  assert.equal(record(v, emptyOffice).staff, 0);
  assert.ok(v.summary.staff <= v.summary.adults);
});
test("shops share unique local customers and staffing limits earnings", () => {
  const s = supplied(),
    home = add(s, "apartment", 11, 10, { residents: 32, level: 2 }),
    cafe = add(s, "cafe", 11, 14),
    market = add(s, "market", 11, 18);
  let v = Sim.analyzeCity(s);
  assert.equal(v.summary.customers, home.residents);
  assert.equal(record(v, cafe).customers + record(v, market).customers, 32);
  assert.equal(v.summary.shopIncome, 64);
  home.residents = 2;
  v = Sim.analyzeCity(s);
  assert.equal(v.summary.staff, 1);
  assert.equal(v.summary.customers, 2);
  assert.equal(v.summary.shopIncome, 1); // 2 customers × $2 × 1/4 staffing.
});
test("shop reach follows a road detour rather than straight-line proximity", () => {
  const s = town();
  line(s, 10, 10, 25);
  for (let x = 11; x <= 20; x++) add(s, "road", x, 25);
  line(s, 20, 10, 24);
  add(s, "cafe", 8, 10);
  add(s, "cottage", 21, 10, { residents: 4 });
  const v = Sim.analyzeCity(s);
  assert.equal(v.networks.length, 1);
  assert.equal(v.summary.staff, 2);
  assert.equal(v.summary.customers, 0);
  assert.equal(v.summary.shopIncome, 0);
});
test("service radii lift happiness once per type; nuisances lower it", () => {
  const s = supplied(),
    home = add(s, "cottage", 11, 12, { residents: 4 });
  add(s, "park", 14, 12);
  add(s, "park", 14, 15);
  const library = add(s, "library", 11, 16);
  let v = Sim.analyzeCity(s);
  assert.equal(
    record(v, home).services.filter((x) => x.type === "park").length,
    1,
  );
  assert.equal(record(v, home).happiness, 82);
  assert.equal(record(v, library).staff, 2);
  add(s, "factory", 14, 18);
  v = Sim.analyzeCity(s);
  assert.equal(record(v, home).nuisance, 12);
  assert.ok(record(v, home).happiness < 82);
  const far = clone(s);
  far.objects = far.objects.filter(
    (o) => o.type !== "park" && o.type !== "library" && o.type !== "factory",
  );
  add(far, "park", 40, 40);
  assert.equal(record(Sim.analyzeCity(far), home).happiness, 60);
});
test("happy supplied homes gain residents and a second floor; missing supply never evicts anyone", () => {
  const s = supplied(),
    home = add(s, "cottage", 11, 12);
  add(s, "park", 14, 12);
  add(s, "library", 11, 16);
  for (let i = 0; i < 4; i++) Sim.stepEconomy(s);
  assert.equal(home.residents, 4);
  assert.equal(home.level, 1);
  for (let i = 0; i < 5; i++) Sim.stepEconomy(s);
  assert.equal(home.level, 2);
  assert.equal(Sim.homeCapacity(home), 8);
  for (let i = 0; i < 8; i++) Sim.stepEconomy(s);
  assert.equal(home.residents, 8);
  for (let i = 0; i < 60; i++) Sim.stepEconomy(s);
  assert.equal(home.growth, 0);
  assert.equal(home.residents, 8);
  s.objects = s.objects.filter((o) => o.type !== "water");
  const count = s.objects.length;
  for (let i = 0; i < 10; i++) Sim.stepEconomy(s);
  assert.equal(home.residents, 8);
  assert.equal(home.level, 2);
  assert.equal(s.objects.length, count);
  assert.equal(home.growth, 0);
});
test("daily budget reconciles exactly; insolvency forgives unpaid upkeep without losing a place", () => {
  const s = town();
  s.money = 1;
  add(s, "hospital", 20, 20);
  add(s, "fire", 25, 20);
  const initial = clone(s.objects);
  const before = Sim.analyzeCity(s).summary;
  assert.equal(before.net, -26);
  assert.equal(before.daysLeft, 0);
  Sim.stepEconomy(s);
  assert.equal(s.money, 0);
  assert.equal(s.lastBudget.unpaid, 25);
  assert.equal(s.lastBudget.net, -26);
  assert.deepEqual(s.objects, initial);
  const b = supplied();
  add(b, "cottage", 11, 12, { residents: 4 });
  const expected = Sim.analyzeCity(b).summary;
  Sim.stepEconomy(b);
  assert.equal(b.money, Math.round((30000 + expected.net) * 100) / 100);
  assert.equal(b.lastBudget.income - b.lastBudget.upkeep, b.lastBudget.net);
});
test("sandbox preserves funds while reporting the real forecast; goals have two sequential tiers", () => {
  const s = supplied();
  s.mode = "sandbox";
  add(s, "cottage", 11, 12);
  const funds = s.money;
  Sim.stepEconomy(s);
  assert.equal(s.money, funds);
  assert.ok(s.lastBudget.income > 0);
  let g = Sim.goalProgress(s, Sim.analyzeCity(s).summary);
  assert.ok(g.filter((g) => g.tier === 2).every((g) => g.locked));
  s.claimedGoals = ["homes", "places", "paths"];
  g = Sim.goalProgress(s, Sim.analyzeCity(s).summary);
  assert.ok(g.filter((g) => g.tier === 2).every((g) => !g.locked));
});
function seededScenario(seed) {
  const s = town();
  s.seed = seed;
  let random = seed >>> 0;
  const next = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  line(s, 22, 25, 40);
  for (let row = 0; row < 4; row++) {
    const z = 25 + row * 5;
    for (let x = 23; x <= 45; x++) add(s, "road", x, z);
    add(s, "park", 23, z + 1);
    add(s, "library", 26, z + 1);
    for (const x of [29, 33, 37, 41])
      add(
        s,
        ["cottage", "family", "apartment"][Math.floor(next() * 3)],
        x,
        z + 1,
      );
  }
  add(s, "wind", 20, 26);
  add(s, "wind", 20, 33);
  add(s, "water", 20, 29);
  add(s, "water", 20, 36);
  add(s, "market", 23, 42);
  add(s, "road", 23, 41);
  add(s, "road", 22, 41);
  add(s, "road", 22, 42);
  return s;
}
test("seed 81024: sixty real economy days are deterministic, solvent and preserve every building", () => {
  const a = seededScenario(81024),
    b = clone(a);
  const count = a.objects.length,
    initialPopulation = Sim.analyzeCity(a).summary.population;
  let previous = initialPopulation;
  for (let i = 0; i < 60; i++) {
    const v = Sim.stepEconomy(a);
    Sim.stepEconomy(b);
    assert.equal(a.day, i + 2);
    assert.ok(Number.isFinite(a.money) && a.money > 0);
    assert.ok(v.summary.population >= previous);
    previous = v.summary.population;
    assert.ok(v.summary.staff <= v.summary.adults);
    assert.ok(v.summary.customers <= v.summary.population);
    assert.ok(v.summary.happiness >= 0 && v.summary.happiness <= 100);
    assert.equal(a.objects.length, count);
    assert.equal(
      a.lastBudget.net,
      Math.round((a.lastBudget.income - a.lastBudget.upkeep) * 100) / 100,
    );
    for (const n of v.networks) {
      assert.ok(n.power <= 1 && n.water <= 1);
      assert.ok(n.demand * n.power <= n.powerSupply + 1e-8);
      assert.ok(n.demand * n.water <= n.waterSupply + 1e-8);
      assert.ok(n.staff <= n.adults);
    }
  }
  assert.equal(a.history.length, 60);
  assert.ok(previous > initialPopulation);
  assert.ok(a.objects.some((o) => o.level === 2));
  assert.deepEqual(clone(a), clone(b));
  fs.mkdirSync(path.join(__dirname, "../test-results"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "../test-results/economy-60-days.json"),
    JSON.stringify(
      {
        seed: 81024,
        days: 60,
        initialPopulation,
        final: Sim.analyzeCity(a).summary,
        history: a.history,
      },
      null,
      2,
    ),
  );
});

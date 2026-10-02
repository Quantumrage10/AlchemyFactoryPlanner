// Turns the recipe database (data/alchemy_db.js) into the planner's own data file (src/data.json),
// then checks the calculation core against modules that have actually been built in game.
// Run `node tools/fetch-data.js` first if data/alchemy_db.js is missing.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

global.window = {};
require(path.join(root, 'data', 'alchemy_db.js'));
const db = window.ALCHEMY_DB;
const { makeCore } = require(path.join(root, 'src', 'core.js'));

const SI = db.items, SM = db.machines;
// Alternate and upgraded recipes are left out: the planner uses one recipe per item, at base machines.
const SKIP = /Enhanced|Advanced Athanor|_Thermal|Seed Plot|_Alt$|Bank_|\(Custom\)|\(Gentian\)|Silver Coin x2|Gentian Mixture\)|^Copper Powder 2|^Silver Powder 2|^Pure Gold Dust 2|^Iron Ingot 2|^Salt_Rock|^Copper Coin$|^Silver Coin$|^Gold Coin$|Meteorite Processing|Steam Boiler|Refined Sand/;
const recs = db.recipes.filter(r => !SKIP.test(r.id));
// nutrient per second a nursery can take on advanced fertilizer
const FERT_SPEED = SI['Advanced Fertilizer'].maxFertility;

const prod = {};
for (const r of recs) for (const o of Object.keys(r.outputs || {})) if (!prod[o]) prod[o] = r;
const kindOf = n => {
  const r = prod[n];
  if (!r) return 'none';
  if (r.machine === 'Purchasing Portal') return 'raw';
  if (/Nursery|World Tree/.test(r.machine)) return 'crop';
  return 'made';
};
const heatOf = r => { const m = SM[r.machine] || {}; if (m.heatCost > 0) return m.heatCost; return r.heatCost || 0; };

const items = {}, recipes = {}, machines = {}, users = {};
for (const r of recs) {
  const main = Object.keys(r.outputs)[0];
  for (const i of Object.keys(r.inputs || {})) (users[i] = users[i] || new Set()).add(main);
}
for (const [n, it] of Object.entries(SI)) {
  if (it.category === 'Currency' || it.virtual) continue;
  const r = prod[n];
  if (!r) continue;
  items[n] = {
    tier: it.tier || 0, sell: it.sellPrice || 0, buy: it.buyPrice || 0, liq: !!it.liquid, kind: kindOf(n), cat: it.category,
    heat: it.heat || 0, nutr: it.nutrientValue || 0, fspeed: it.maxFertility || 0,
    uses: [...(users[n] || [])].filter(x => SI[x] && !SI[x].virtual && SI[x].category !== 'Currency'),
  };
  const t = (r.machine === 'Nursery' && r.nutrientCost) ? r.nutrientCost / FERT_SPEED : (r.baseTime || 1);
  recipes[n] = { id: r.id, machine: r.machine, ins: r.inputs || {}, outs: r.outputs, t, nut: r.nutrientCost || 0, shared: r.sharedOutputs || 0, heat: heatOf(r) };
  const m = SM[r.machine] || {};
  machines[r.machine] = { v: (m.L && m.W && m.H) ? m.L * m.W * m.H : null, slots: m.slotsRequired || 0, L: m.L || 0, W: m.W || 0, H: m.H || 0 };
}

// density: does the recipe pack things down (more solid items in than out)? A 1:1 step on a dense item stays dense.
const solid = o => Object.entries(o || {}).filter(([k]) => !(SI[k] && SI[k].liquid));
const ratio = n => {
  const r = prod[n];
  if (!r || kindOf(n) !== 'made') return 0;
  const a = solid(r.inputs).reduce((s, [, q]) => s + q, 0), b = solid(r.outputs).reduce((s, [, q]) => s + q, 0);
  return b ? a / b : 0;
};
const dmemo = {};
const dense = (n, seen = new Set()) => {
  if (n in dmemo) return dmemo[n];
  if (seen.has(n)) return false;
  seen.add(n);
  if (kindOf(n) !== 'made') return dmemo[n] = false;
  const rt = ratio(n);
  return dmemo[n] = rt > 1 || (rt === 1 && solid(prod[n].inputs).some(([k]) => dense(k, seen)));
};
for (const n in items) {
  const r = prod[n];
  items[n].dense = dense(n);
  items[n].relic = SI[n].category === 'Relic';
  items[n].rtxt = kindOf(n) === 'made'
    ? (solid(r.inputs).map(([k, q]) => q + ' ' + k).join(' + ') || 'nothing') + ' → ' + solid(r.outputs).map(([k, q]) => q + ' ' + k).join(' + ')
    : '';
}

const DATA = { items, recipes, machines, version: db.gameVersion, dataDate: db.date };
const C = makeCore(DATA);

// ---------- regression checks against modules that exist in game ----------
const UNI = new Set(C.UNIVERSAL);
const cnt = (sol, item) => { const m = sol.list.find(x => x.item === item); return m ? +m.count.toFixed(3) : 0; };
let failed = 0;
const expect = (label, got, want) => {
  const ok = Math.abs(got - want) < 0.01;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + ': got ' + got + ', want ' + want);
};
let s = C.solve('Jupiter', 0.1, UNI);
expect('Jupiter pulley assemblers', cnt(s, 'Wooden Pulley'), 4);
expect('Jupiter rope processors', cnt(s, 'Linen Rope'), 6);
expect('Jupiter thread processors', cnt(s, 'Linen Thread'), 6);
expect('Jupiter fiber grinders', cnt(s, 'Flax Fiber'), 18);
expect('Jupiter flax nurseries', cnt(s, 'Flax'), 6);
s = C.solve('Coke Powder', 45, UNI);
expect('Coke 45 saws', cnt(s, 'Plank'), 15);
expect('Coke 45 crucibles', cnt(s, 'Charcoal'), 30);
expect('Coke 45 charcoal grinders', cnt(s, 'Charcoal Powder'), 36);
expect('Coke 45 athanors', cnt(s, 'Coke'), 4.5);
expect('Coke 45 coke grinders', cnt(s, 'Coke Powder'), 9);
expect('Coke 45 net at Fuel Efficiency 0', +(45 - C.fuelPerMin(s, 0)).toFixed(1), 21);
s = C.solve('Glass', 60, UNI);
expect('Glass 60 kilns', cnt(s, 'Glass'), 6);
expect('Glass 60 crushers', cnt(s, 'Stone'), 18);
expect('Glass 60 sand grinders', cnt(s, 'Sand'), 72);
s = C.solve('Advanced Fertilizer', 60, UNI);
expect('Fertilizer 60 saws', cnt(s, 'Gloom Fungus'), 10);
expect('Fertilizer 60 crushers', cnt(s, 'Stone'), 3);
expect('Fertilizer 60 quicklime crucibles', cnt(s, 'Quicklime'), 9);
expect('Fertilizer 60 plant ash crucibles', cnt(s, 'Plant Ash'), 3);
expect('Fertilizer 60 nurseries', cnt(s, 'Sage'), 1);
expect('Fertilizer 60 spare planks', +(s.spare['Plank'] || 0).toFixed(0), 240);

if (failed) { console.error('\n' + failed + ' check(s) failed. src/data.json was not written.'); process.exit(1); }
fs.writeFileSync(path.join(root, 'src', 'data.json'), JSON.stringify(DATA));
console.log('\nWrote src/data.json: ' + Object.keys(items).length + ' items, recipe data ' + db.date + ', game ' + db.gameVersion);

// Assembles index.html from src/ and smoke-tests the page script before writing it.
// Usage: node tools/build.js            -> index.html, a complete page (what GitHub Pages serves)
//        node tools/build.js --fragment -> dist/fragment.html, the same page without <html>/<head>/<body> wrappers
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');

const css = read('style.css');
const page = read('page.html');
const core = read('core.js').replace(/if\(typeof module!=='undefined'\)[^\n]*\n?/, '');
const ui = read('ui.js');
const data = read('data.json');
const script = 'const DATA=' + data + ';\n' + core + '\n' + ui;

const TITLE = 'Bus Split Planner';
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&display=swap">';
const inner = '<title>' + TITLE + '</title>\n' + FONTS + '\n<style>\n' + css + '</style>\n' + page + '<script>\n' + script + '\n</script>\n';

// ---- smoke test: run the page script against a stub DOM so a broken build never gets written ----
const els = {};
const mk = id => ({ id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, children: [], attrs: {},
  setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
  addEventListener() {}, appendChild(c) { this.children.push(c); }, closest() { return null; } });
const doc = { getElementById: id => els[id] || (els[id] = mk(id)), createElement: () => mk('_'), querySelectorAll: () => [] };
const init = { fe: '0', mL: '14', mW: '14', mH: '15', connmax: '8', lvlbelt: '0', lvlspeed: '14', lvlalch: '0', lvlfert: '0', lvlsell: '0', fuelsel: 'Coke Powder', fertsel: 'Advanced Fertilizer' };
for (const k in init) doc.getElementById(k).value = init[k];
const store = {};
const ls = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
const api = new Function('document', 'localStorage', 'window', script + '\n;return {get byArrows(){ return byArrows; },treeProblems,modNames,openMod,decide,status,setPlace,addTag,deleteTag,resetPlan,clearPlan,valueOf};')(doc, ls, { scrollTo() {} });
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const must = (cond, msg) => { if (!cond) { console.error('Smoke test failed: ' + msg); process.exit(1); } };
// a stylesheet that closes its own <style> tag, or contains script, spills onto the page as text
must(!/<\/style|<script|readFileSync|require\(/i.test(css), 'src/style.css contains something that is not CSS');
// only features every current browser has: these have each caused, or would cause, a difference between browsers
// the drawn coin has its own class; .coin belongs to the bought-with-coins boxes and tags in the tree
must(!css.includes('.coin{display:inline-block') && !css.includes('.coin{width') && !ui.includes('class="coin c-'), 'the coin icon must use the cicon class, not coin');
for (const bad of ['color-mix(', ':has(', 'overflow:clip', '@container']) must(!css.includes(bad), 'src/style.css uses ' + bad + ', which not every current browser supports');
for (const bad of ['inputType', 'movementX', 'movementY', ':scope']) must(!ui.includes(bad), 'src/ui.js relies on ' + bad + ', which browsers handle differently');
must(els.rows.innerHTML.includes('Coke Powder'), 'bus table did not render');
must(els['pane-setup'].hidden === false && els.ctx.hidden === true, 'a first visit should open on the setup page');
must(/14×14×15 tiles/.test(els.ctxtxt.textContent), 'the setup reminder line is missing');
must(doc.getElementById('lvlspeed').value == 0, 'a stray value in the Factory Efficiency box was not reset to its default');
api.openMod('Jupiter');
must(/Flax 360\/min/.test(strip(els.ingr.innerHTML)), 'Jupiter ingredients did not render');
must(/Advanced Fertilizer.*12\/min/.test(strip(els.busin.innerHTML)), 'Jupiter bus inputs are wrong');
must(els.rate.step == 0.01, 'below one, the output should step by 0.01: ' + els.rate.step);
els.rate.value = '1'; els.rate.oninput(); els.rate.value = '0'; els.rate.oninput();
must(els.rate.value == 0.99, 'stepping down from 1 should land on 0.99: ' + els.rate.value);
{ const t = strip(els.mrows.innerHTML); must(t.indexOf('Nursery') < t.indexOf('Grinder') && t.indexOf('Grinder') < t.indexOf('Processor') && t.indexOf('Processor') < t.indexOf('Shaper'), 'machines should be listed in build order: ' + t.slice(0, 200)); }
must(els.ingr.innerHTML.lastIndexOf('<b>') === els.ingr.innerHTML.indexOf('<b>Jupiter</b>'), 'the finished item should be the last box');
{ const t = strip(els.ingr.innerHTML); must((t.match(/Logs /g) || []).length === 3, 'planks go into the pulley, the gears and Jupiter itself, so logs and planks should show three times: ' + t); }
api.openMod('Saturn');
// salt's Athanor gives off sand; with salt, brick and glass all made inside, that sand feeds the glass and clay and no sand is ground
api.setPlace('Salt', 'off'); api.setPlace('Brick', 'off'); api.setPlace('Glass', 'off'); api.openMod('Saturn');
{ const t = strip(els.ingr.innerHTML), m = strip(els.mrows.innerHTML); must(!/Sand [0-9.,]+.min/.test(t), 'sand is a byproduct of the salt, so it should have no box and nothing ground for it: ' + t.slice(0, 400)); must(!/Grinder Sand/.test(m), 'a machine that is not needed should not be listed: ' + m); }
api.setPlace('Salt', null); api.setPlace('Brick', null); api.setPlace('Glass', null); api.openMod('Saturn');
// Saturn opens at the biggest size that fits, 0.4/min: two stations each for salt, brick and glass, plus one out
must(els.rate.value == 0.4, 'Saturn did not open at its biggest fitting size: ' + els.rate.value);
must(/Total 7 of 8/.test(strip(els.conn.innerHTML)), 'Saturn bus connections are wrong');
api.decide('Linen Rope', 'bus');
must(api.status('Linen Rope').code === 'ded', 'a bus choice did not apply');
api.decide('Linen Rope', null);
must(+JSON.parse(store.bsp_settings_v2).mH === 15, 'settings were not remembered');
// upgrades: two levels of each should speed machines up and widen belts
doc.getElementById('lvlbelt').value = '2'; doc.getElementById('lvlspeed').value = '2';
doc.getElementById('lvlspeed').oninput();
api.openMod('Glass');
must(/Kiln\s+(HEAT\s+)?Glass\s+15\/min/.test(strip(els.mrows.innerHTML)), 'factory efficiency did not speed machines up: ' + strip(els.mrows.innerHTML).slice(0, 160));
must(/90\/min/.test(els.upnote.textContent), 'belt upgrade did not change belt speed');
doc.getElementById('lvlbelt').value = '0'; doc.getElementById('lvlspeed').value = '0';
doc.getElementById('lvlspeed').oninput();
// fertilizer efficiency: 10 levels doubles how far fertilizer goes, so Jupiter's 12/min halves
doc.getElementById('lvlfert').value = '10'; doc.getElementById('lvlfert').oninput();
api.openMod('Jupiter');
must(/Advanced Fertilizer.*?6\/min/.test(strip(els.busin.innerHTML)), 'fertilizer efficiency did not change fertilizer use: ' + strip(els.busin.innerHTML));
doc.getElementById('lvlfert').value = '0'; doc.getElementById('lvlfert').oninput();
// sales ability: one level is +25%, so brick's 70 becomes 87.5
doc.getElementById('lvlsell').value = '1'; doc.getElementById('lvlsell').oninput();
must(/87\.5/.test(strip(els.rows.innerHTML)), 'sales ability did not raise prices by 25%');
must(els.rows.innerHTML.includes('37.5 <i class="cicon c-silver">') && els.rows.innerHTML.includes('37,500 copper'), 'prices should show in the right coin, with the full copper amount on hover');
doc.getElementById('lvlsell').value = '0'; doc.getElementById('lvlsell').oninput();
// a different fuel: blast potion is far hotter than coke powder, so a glass module needs far less of it
api.openMod('Glass');
must(/Coke Powder/.test(strip(els.busin.innerHTML)), 'glass should burn coke powder by default');
must(els.rate.step == 1, 'from one upwards, the output should step by 1: ' + els.rate.step);
doc.getElementById('fuelsel').value = 'Blast Potion'; doc.getElementById('fuelsel').onchange();
api.openMod('Glass');
must(/Blast Potion/.test(strip(els.busin.innerHTML)) && !/Coke Powder/.test(strip(els.busin.innerHTML)), 'changing the fuel did not change what glass burns: ' + strip(els.busin.innerHTML));
must(api.status('Blast Potion').code === 'mix' && api.status('Blast Potion').wagon === 'fuel' && /fuel you've picked/.test(api.status('Blast Potion').why), 'the chosen fuel should be the one that is always on the bus');
must(!/fuel you've picked/.test(api.status('Coke Powder').why), 'coke powder should stop being the always-on fuel once another fuel is picked');
// with another fuel picked, coke powder is an ordinary item: it must be the powder that ships, never coke
must(api.status('Coke').code === 'no', 'coke should never be put on the bus: ' + api.status('Coke').why);
must(api.status('Coke Powder').code !== 'no', 'coke powder should be what ships, not coke: ' + api.status('Coke Powder').why);
api.openMod('Steel Ingot');
must(/Coke Powder/.test(strip(els.busin.innerHTML)) && !/Coke [^P]/.test(strip(els.busin.innerHTML)), 'steel should take coke powder off the bus, not coke: ' + strip(els.busin.innerHTML));
// steel ingot has other uses, so it still ships and gears are made on site
must(api.status('Steel Ingot').code === 'ded' && api.status('Steel Gear').code === 'no', 'steel ingot should ship and steel gears be made on site');
doc.getElementById('fuelsel').value = 'Coke Powder'; doc.getElementById('fuelsel').onchange();
// a byproduct goes back to its own line: the coke Athanor's charcoal feeds its own charcoal powder, the steel Athanor's iron its own steel
api.openMod('Coke Powder'); els.rate.value = '30'; els.rate.oninput();
{ const t = strip(els.ingr.innerHTML); must(t.includes('Charcoal 300/min') && t.includes('Plank 300/min'), 'coke should get 60 charcoal back and make only 300: ' + t); }
api.openMod('Steel Ingot'); els.rate.value = '60'; els.rate.oninput();
{ const t = strip(els.ingr.innerHTML); must(t.includes('Iron Ingot 60/min'), 'steel should get 180 iron ingots back and smelt only 60: ' + t); }
// with everything made inside, a steel Athanor only ever hands back what it gave off: three iron ingots for each steel ingot
api.clearPlan(); api.openMod('Sol'); els.rate.value = '0.01'; els.rate.oninput();
{ const steel = api.byArrows.filter(a => a.item === 'Iron Ingot' && a.from === 'Steel Ingot'), other = api.byArrows.filter(a => a.item === 'Iron Ingot' && a.from !== 'Steel Ingot');
  must(steel.length > 0 && steel.every(a => a.self), 'steel iron ingots should only loop back into the Athanor they came out of: ' + JSON.stringify(steel.filter(a => !a.self).slice(0, 3)));
  must(other.every(a => a.from === 'Sulfur'), 'spare iron ingots elsewhere should be credited to the smelter making sulfur: ' + JSON.stringify(other.slice(0, 3))); }
// and no box hands out more of a byproduct than it gives off: a salt Athanor makes 12 sand for every salt
{ const out = {}; for (const a of api.byArrows) if (a.item === 'Sand' && a.from === 'Salt') out[a.fromId] = (out[a.fromId] || 0) + a.amt;
  const t = els.ingr.innerHTML; for (const id in out) { const m = t.match(new RegExp('data-id="' + id + '" data-n="Salt"><div><b>Salt</b> <span class="amt">([0-9.,]+)/min')); must(m, 'sand arrow from a box that is not a salt box: ' + id); const salt = +m[1].replace(/,/g, ''); must(out[id] <= salt * 12 * 1.02 + 0.5, 'a salt box making ' + salt + '/min hands out ' + out[id].toFixed(0) + ' sand, more than 12 each'); } }
api.resetPlan();
// the ingredient tree's rules hold for every module in the game, three ways: the recommended plan, everything made
// inside, and everything made inside at a different size
{ const check = label => { for (const m of api.modNames()) { api.openMod(m); const bad = api.treeProblems(); must(!els.ingr.innerHTML.includes('"amt">0/min<'), 'ingredient tree, ' + label + ', ' + m + ': a box is shown making 0/min'); must(!bad.length, 'ingredient tree, ' + label + ', ' + m + ': ' + bad.slice(0, 3).join(' | ')); } };
  check('recommended plan');
  api.clearPlan(); check('everything made inside');
  for (const m of api.modNames()) { api.openMod(m); els.rate.value = String(+els.rate.value * 7.3 || 3); els.rate.oninput(); const bad = api.treeProblems(); must(!bad.length, 'ingredient tree, everything made inside at another size, ' + m + ': ' + bad.slice(0, 3).join(' | ')); }
  api.resetPlan(); }
// when a bus connection runs out between two whole-machine sizes, the size table still offers the most that fits
api.openMod('Gold Dust');
must(/Most that fits/.test(strip(els.fit.innerHTML)) && !/Even the smallest size is too big/.test(strip(els.fit.innerHTML)), 'gold dust should be offered the most that fits its bus connections: ' + strip(els.fit.innerHTML).slice(0, 300));
must(+els.rate.value > 0 && /of 8/.test(strip(els.conn.innerHTML)) && !/(9|1\d) of 8/.test(strip(els.conn.innerHTML)), 'gold dust should open at a size its bus connections allow: ' + els.rate.value + ' ' + strip(els.conn.innerHTML).slice(-40));
// the recommended layout: fuel, fertilizer and relics each share a wagon type, sell-only things ride the shop wagon
const where = n => api.valueOf(api.status(n));
must(where('Coke Powder') === 'tag:fuel' && where('Advanced Fertilizer') === 'tag:fert' && where('Jupiter') === 'tag:research', 'fuel, fertilizer and relics should start on their shared wagons');
must(where('Panacea Potion') === 'off', 'panacea burns and feeds nurseries, so it should not default to the shop wagon');
must(where('Pocket Watch') === 'tag:research' && where('Brick') === 'own' && where('Glass') === 'own', 'only sell-only items start on the shop wagon; brick and glass keep their own wagons');
must(/Yes · fuel wagon/.test(strip(els.rows.innerHTML)), 'the label should name the shared wagon');
must(/Wagon types on your bus: \d+/.test(els.wcount.textContent), 'the wagon type count is missing');
// anything can be put anywhere, and every module follows
api.setPlace('Coke Powder', 'own');
must(api.status('Coke Powder').code === 'ded' && api.status('Coke Powder').mine, 'an item should be movable to its own wagons');
api.setPlace('Brick', 'maybe');
must(api.status('Brick').code === 'maybe', 'an item should be markable as a maybe');
const tid = api.addTag('saturn parts');
api.setPlace('Glass', 'tag:' + tid);
must(api.status('Glass').code === 'mix' && /Yes · saturn parts wagon/.test(strip(els.rows.innerHTML)), 'an item should be addable to a shared wagon you made');
api.openMod('Saturn');
must(/Glass/.test(strip(els.busin.innerHTML)) && !/Brick/.test(strip(els.busin.innerHTML)), 'modules should follow the plan: ' + strip(els.busin.innerHTML));
api.deleteTag(tid);
must(where('Glass') === 'own', 'deleting a shared wagon should put its items back');
// clearing takes everything off the bus; resetting brings the recommended layout back
api.clearPlan();
must(where('Coke Powder') === 'off' && where('Jupiter') === 'off' && where('Glass') === 'off', 'clearing should take everything off the bus');
must(/Wagon types on your bus: 0 /.test(els.wcount.textContent), 'a cleared plan should need no wagon types');
must(els.tags.innerHTML === '', 'clearing should remove the shared wagons too');
api.setPlace('Glass', 'own');
must(where('Glass') === 'own' && where('Brick') === 'off', 'after clearing, only what you place is on the bus');
api.resetPlan();
must(where('Coke Powder') === 'tag:fuel' && where('Brick') === 'own', 'resetting should bring the recommended layout back');

if (process.argv.includes('--fragment')) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'fragment.html'), inner);
  console.log('Wrote dist/fragment.html (' + inner.length + ' bytes)');
} else {
  const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>' + TITLE + '</title>\n' + FONTS + '\n<style>\nbody{margin:0}\n[hidden]{display:none!important}\n' + css + '</style>\n</head>\n<body>\n'
    + page + '<script>\n' + script + '\n</script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(root, 'index.html'), full);
  console.log('Wrote index.html (' + full.length + ' bytes)');
}

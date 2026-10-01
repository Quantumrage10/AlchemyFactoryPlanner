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
const init = { fe: '0', mL: '14', mW: '14', mH: '15', connmax: '8' };
for (const k in init) doc.getElementById(k).value = init[k];
const store = {};
const ls = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } };
const api = new Function('document', 'localStorage', 'window', script + '\n;return {openMod,decide,status};')(doc, ls, { scrollTo() {} });
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const must = (cond, msg) => { if (!cond) { console.error('Smoke test failed: ' + msg); process.exit(1); } };
// a stylesheet that closes its own <style> tag, or contains script, spills onto the page as text
must(!/<\/style|<script|readFileSync|require\(/i.test(css), 'src/style.css contains something that is not CSS');
must(els.rows.innerHTML.includes('Coke Powder'), 'bus table did not render');
api.openMod('Jupiter');
must(/Flax 360\/min/.test(strip(els.ingr.innerHTML)), 'Jupiter ingredients did not render');
must(/Advanced Fertilizer.*12\/min/.test(strip(els.busin.innerHTML)), 'Jupiter bus inputs are wrong');
api.openMod('Saturn');
must(/Total 4 of 8/.test(strip(els.conn.innerHTML)), 'Saturn bus connections are wrong');
api.decide('Linen Rope', 'bus');
must(api.status('Linen Rope').code === 'ded', 'a bus choice did not apply');
api.decide('Linen Rope', null);
must(JSON.parse(store.bsp_settings).mH === '15', 'settings were not remembered');

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

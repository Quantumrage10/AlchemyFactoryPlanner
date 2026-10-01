// Downloads the pinned recipe database into data/ (which git ignores).
// The database belongs to starfi5h's Alchemy Factory Calculator; it isn't committed to this repository.
// To move to newer recipes, change COMMIT to a newer commit of that repository, then run this and gen-data.js.
const fs = require('fs');
const path = require('path');
const https = require('https');

const COMMIT = '751b40e31f576c82d2b8e78d65048955b6b851f4';
const URL = 'https://raw.githubusercontent.com/starfi5h/AlchemyFactoryCalculator/' + COMMIT + '/js/alchemy_db.js';
const dest = path.join(__dirname, '..', 'data', 'alchemy_db.js');

fs.mkdirSync(path.dirname(dest), { recursive: true });
https.get(URL, res => {
  if (res.statusCode !== 200) { console.error('Download failed: HTTP ' + res.statusCode); process.exit(1); }
  const out = fs.createWriteStream(dest);
  res.pipe(out);
  out.on('finish', () => console.log('Saved ' + dest));
}).on('error', e => { console.error('Download failed: ' + e.message); process.exit(1); });

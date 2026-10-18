const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../out');
let count = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(dir, entry.name);
    if (entry.name.startsWith('__next.')) flatten(target, dir, entry.name);
    else walk(target);
  }
}

function flatten(dir, parent, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name), name = prefix + '.' + entry.name;
    if (entry.isDirectory()) flatten(file, parent, name);
    else if (entry.name.endsWith('.txt')) {
      fs.copyFileSync(file, path.join(parent, name));
      count++;
    }
  }
}

walk(root);
console.log(`Static segment aliases: ${count} (Windows compatibility).`);

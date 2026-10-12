// Self-check for the PWA files: manifest, icons, service worker precache list. Run: node pwa.check.js
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const exists = f => existsSync(new URL(f, import.meta.url));
const html = read('index.html');

// manifest: required fields, relative start_url/scope (served from a GitHub Pages project path)
assert.match(html, /<link rel="manifest" href="manifest\.json">/);
const m = JSON.parse(read('manifest.json'));
assert.equal(m.name, 'Stock Cutting');
assert.ok(m.short_name && m.short_name.length <= 12, 'short_name fits under a home-screen icon');
assert.deepEqual([m.start_url, m.scope, m.display], ['./', './', 'standalone']);
for (const c of [m.theme_color, m.background_color]) assert.match(c, /^#[0-9a-f]{6}$/);
assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'));

// every icon exists as a PNG with the stated pixel size (IHDR width/height at bytes 16..23)
const png = f => {
  const b = readFileSync(new URL(f, import.meta.url));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};
for (const i of m.icons) assert.equal(png(i.src), i.sizes, i.src);
const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
assert.ok(touch, 'apple-touch-icon linked');
assert.equal(png(touch[1]), '180x180');
for (const name of ['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title', 'theme-color'])
  assert.match(html, new RegExp(`<meta name="${name}" content="[^"]+">`), name);

// files the app needs: local src/href in index.html, manifest icons, and the ES module import graph
const need = new Set(['index.html']);
const local = u => !/^[a-z]+:/i.test(u);
for (const [, u] of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (local(u)) need.add(u);
for (const i of m.icons) need.add(i.src);
const todo = [...need].filter(f => f.endsWith('.js'));
while (todo.length) {
  for (const [, u] of read(todo.pop()).matchAll(/^import\b[^'"]*['"]\.\/([^'"]+)['"]/gm))
    if (!need.has(u)) { need.add(u); todo.push(u); }
}
assert.ok(need.has('cutting-plan.js'), 'import graph followed');

// sw.js precaches exactly those files (plus './', the start_url), all of which exist
const sw = read('sw.js');
const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
assert.ok(files.includes('./'), "precache './' (start_url)");
const listed = new Set(files.filter(f => f !== './'));
assert.deepEqual([...need].filter(f => !listed.has(f)), [], 'missing from precache');
assert.deepEqual([...listed].filter(f => !need.has(f)), [], 'precached but not used');
for (const f of listed) assert.ok(exists(f), `${f} exists`);
assert.equal(files.length, listed.size + 1, 'no duplicates');
assert.match(sw, /const VERSION = '[^']+'/);
assert.match(read('app.js'), /navigator\.serviceWorker\.register\('sw\.js'\)/);

console.log('pwa.check.js: manifest, icons, apple meta and precache list checks passed');

// Self-check for the PWA files: manifest, icons, service worker precache list. Run: node pwa.check.js
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// files the app needs: local src/href in index.html, manifest icons, the ES module import graph and
// files the modules fetch('…') (parts.json: offline at the mill it must come from the precache)
const need = new Set(['index.html']);
const local = u => !/^[a-z]+:/i.test(u);
for (const [, u] of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (local(u)) need.add(u);
for (const i of m.icons) need.add(i.src);
const todo = [...need].filter(f => f.endsWith('.js'));
while (todo.length) {
  const js = read(todo.pop());
  for (const [, u] of js.matchAll(/^import\b[^'"]*['"]\.\/([^'"]+)['"]/gm))
    if (!need.has(u)) { need.add(u); todo.push(u); }
  for (const [, u] of js.matchAll(/\bfetch\('([^']+)'/g)) if (local(u)) need.add(u);
}
assert.ok(need.has('cutting-plan.js'), 'import graph followed');
assert.ok(need.has('parts.json'), 'fetched files followed');

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

// VERSION guard: precached files changed since HEAD but VERSION didn't -> phones keep the old files
assert.equal(versionError([], 'v1', 'v1'), null);
assert.equal(versionError(['app.js'], 'v1', 'v2'), null);
assert.equal(versionError(['app.js'], null, 'v1'), null, 'no sw.js in HEAD: nothing to compare');
assert.match(versionError(['app.js', 'style.css'], 'v1', 'v1'), /app\.js, style\.css changed .* VERSION is still 'v1'/);
function versionError(changed, oldVersion, newVersion) {
  if (!changed.length || oldVersion === null || oldVersion !== newVersion) return null;
  return `${changed.join(', ')} changed since HEAD but sw.js VERSION is still '${oldVersion}': bump it`;
}
// --staged (pre-commit hook): compare the index with HEAD; otherwise the working tree with HEAD
const staged = process.argv.includes('--staged');
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const swVersion = src => src.match(/const VERSION = '([^']+)'/)?.[1] ?? null;
let changed;
try { changed = git('diff', '--name-only', '--relative', ...(staged ? ['--cached'] : []), 'HEAD', '--', ...listed).split('\n').filter(Boolean); }
catch { console.log('pwa.check.js: no git or no HEAD, VERSION guard skipped'); }
if (changed) {
  let oldVersion = null;
  try { oldVersion = swVersion(git('show', 'HEAD:sw.js')); } catch { /* sw.js not in HEAD yet */ }
  const err = versionError(changed, oldVersion, swVersion(staged ? git('show', ':sw.js') : sw));
  if (err) { console.error('pwa.check.js: ' + err); process.exit(1); }
}

console.log('pwa.check.js: manifest, icons, apple meta and precache list checks passed');

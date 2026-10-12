// Stock Cutting — state and rendering. Pure functions, no DOM access, so Node checks
// (view.check.js) and a browser test page can drive any state:
//   - transitions: (state, ...) -> patch for app.js set(), or null when nothing changes
//   - render: state -> HTML string
// Clickable elements carry data-action (plus data-* arguments); app.js dispatches them.
// All user-provided text (part names, numbers typed in) goes through esc().

import { DEFAULT_SETTINGS, makePlan, volume, unitPrice } from './cutting-plan.js';

// State shape follows README "State". version is bumped on every stock/settings change;
// the plan is stale when it was made at another version.
// Form fields hold the strings as typed; stock entries hold numbers.
export const initialState = () => ({
  tab: 'stock',
  project: '', parts: [], partsError: null, // from parts.json (startWith); partsError: why it didn't load
  partsId: '', // fingerprint of the part list the saved plan was made for, kept while parts.json is broken
  stock: [],
  settings: { ...DEFAULT_SETTINGS },
  form: { t: '', w: '', l: '', count: 1, price: '', unit: 'pc' },
  editId: null, openId: null, flashId: null,
  plan: null, planVersion: 0, version: 0,
  selectedPartUid: null, zoom: {}, done: {},
  partsOpen: false, settingsOpen: false
});

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Formatting shared by both screens
export const X = ' × ';
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const eur = n => '€' + fmt(n);
export const m3 = mm3 => (mm3 / 1e9).toFixed(3);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---- Stock transitions ----

export const cleanDigits = v => String(v).replace(/[^0-9]/g, '').slice(0, 5);
export const cleanPrice = v => String(v).replace(/[^0-9.,]/g, '').slice(0, 7);
export const canAdd = f => +f.t > 0 && +f.w > 0 && +f.l > 0;
const emptyForm = (t, unit) => ({ t, w: '', l: '', count: 1, price: '', unit });

// Add a new entry, merge into an identical T × W × L, or save the entry being edited.
export function submitStock(s) {
  const f = s.form;
  if (!canAdd(f)) return null;
  const t = +f.t, w = +f.w, l = +f.l;
  const price = parseFloat(String(f.price).replace(',', '.'));
  const entry = { t, w, l, count: f.count, price: isNaN(price) ? null : price, unit: f.unit };
  let stock, flashId;
  const dup = s.stock.find(x => x.t === t && x.w === w && x.l === l);
  if (s.editId != null) {
    flashId = s.editId;
    stock = s.stock.map(x => (x.id === flashId ? { ...x, ...entry } : x));
  } else if (dup) {
    flashId = dup.id;
    stock = s.stock.map(x => (x !== dup ? x : {
      ...x,
      count: x.count == null || entry.count == null ? null : x.count + entry.count,
      ...(entry.price != null && { price: entry.price, unit: entry.unit })
    }));
  } else {
    flashId = s.stock.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    stock = [...s.stock, { id: flashId, ...entry }];
  }
  return { stock, flashId, editId: null, openId: null, version: s.version + 1, form: emptyForm(String(t), f.unit) };
}

export function startEdit(s, id) {
  const x = s.stock.find(e => e.id === id);
  if (!x) return null;
  return {
    editId: id, openId: null,
    form: { t: String(x.t), w: String(x.w), l: String(x.l), count: x.count, price: x.price == null ? '' : String(x.price), unit: x.unit }
  };
}

export const cancelEdit = s => ({ editId: null, form: emptyForm(s.form.t, s.form.unit) });

export const deleteStock = (s, id) => ({
  stock: s.stock.filter(x => x.id !== id), openId: null, version: s.version + 1,
  editId: s.editId === id ? null : s.editId
});

// count: null = unlimited. − floors at 1; − or + while unlimited → 1; ∞ toggles.
export function stepCount(f, op) {
  const c = f.count;
  const count = op === 'inf' ? (c == null ? 1 : null) : c == null ? 1 : Math.max(1, c + (op === 'inc' ? 1 : -1));
  return { ...f, count };
}

export const toggleUnit = f => ({ ...f, unit: f.unit === 'pc' ? 'm3' : 'pc' });

export function setSetting(s, key, raw) {
  const v = +cleanDigits(raw) || 0;
  if (s.settings[key] === v) return null;
  return { settings: { ...s.settings, [key]: v }, version: s.version + 1 };
}

const canCalc = s => s.stock.length > 0 && s.parts.length > 0;
export function calculate(s) {
  if (!canCalc(s)) return null;
  return {
    plan: makePlan(s.parts, s.stock, s.settings), planVersion: s.version, tab: 'plan',
    openId: null, selectedPartUid: null, done: {}, zoom: {}
  };
}

// ---- Part list (parts.json) ----
// { "project": "Workbench", "parts": [{ "name": "Leg", "t": 90, "w": 130, "l": 725, "n": 4 }] }
// Finished sizes in whole mm: t thickness, w across the board, l along the grain (w > l or t > w
// is fine), n = quantity. Other keys are ignored. A bad row is rejected with a message naming it;
// dimensions are never reordered or rounded (size ordering is the converter's job).
const whole = v => Number.isInteger(v) && v > 0;
export function parseParts(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return { error: `parts.json is not valid JSON: ${e.message}` }; }
  if (!obj(d) || !Array.isArray(d.parts)) return { error: 'parts.json must look like { "project": "…", "parts": [ … ] }' };
  if (typeof d.project !== 'string' || !d.project.trim()) return { error: 'parts.json: "project" must be a non-empty name' };
  if (!d.parts.length) return { error: 'parts.json has no parts' };
  const parts = [];
  for (const [i, p] of d.parts.entries()) {
    const row = `Part ${i + 1}` + (typeof p?.name === 'string' && p.name.trim() ? ` ("${p.name}")` : '');
    const bad = !obj(p) ? 'must be { "name", "t", "w", "l", "n" }'
      : typeof p.name !== 'string' || !p.name.trim() ? 'name must be a non-empty text'
      : ['t', 'w', 'l'].filter(k => !whole(p[k])).map(k => `${k} must be a whole number of mm > 0, got ${JSON.stringify(p[k])}`)[0]
      ?? (!whole(p.n) ? `n must be a whole number ≥ 1, got ${JSON.stringify(p.n)}` : null);
    if (bad) return { error: `${row}: ${bad}` };
    parts.push({ name: p.name, t: p.t, w: p.w, l: p.l, n: p.n });
  }
  return { project: d.project, parts };
}

// Startup: parts.json first (loaded = parseParts result or { error }), then the saved data checked
// against those parts. A part list that changes at runtime goes the same way:
// set(startWith(loaded, serialize(state))) drops plan, ticks and planVersion if the parts differ.
export const startWith = (loaded, json) => loaded.error
  ? { project: '', parts: [], partsError: loaded.error, ...restore(json, null) }
  : { project: loaded.project, parts: loaded.parts, partsError: null, ...restore(json, loaded.parts) };

// ---- Persistence ----
// app.js keeps serialize(state) in localStorage and starts from restore(saved, parts).
// Ticks are keyed by part uid (p0, p1… in BOM order), so plan and ticks only stay valid for the
// same part list: a fingerprint of the parts drops them when the list changed.
// parts null = part list unknown (parts.json broken): keep the plan, it carries its own parts.
// Anything unreadable (no data, corrupt JSON, other schema, bad shapes) → {} = start clean.
export const STORAGE_KEY = 'stock-cutting';
export const SCHEMA = 1;
const partsKey = parts => parts.map(p => [p.name, p.t, p.w, p.l, p.n].join('|')).join(';');

export const serialize = s => JSON.stringify({
  schema: SCHEMA, parts: s.partsError ? s.partsId : partsKey(s.parts), stock: s.stock, settings: s.settings,
  plan: s.plan, planVersion: s.planVersion, version: s.version, done: s.done
});

const num = v => typeof v === 'number' && v >= 0;
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const okStock = x => obj(x) && [x.id, x.t, x.w, x.l].every(num)
  && (x.count === null || num(x.count)) && (x.price === null || num(x.price)) && (x.unit === 'pc' || x.unit === 'm3');
const okPlan = d => obj(d.plan) && Array.isArray(d.plan.slabs) && Array.isArray(d.plan.unplaced) && obj(d.plan.totals)
  && num(d.planVersion) && obj(d.done);

export function restore(json, parts) {
  let d;
  try { d = JSON.parse(json); } catch { return {}; }
  if (!obj(d) || d.schema !== SCHEMA || !Array.isArray(d.stock) || !d.stock.every(okStock)
    || !obj(d.settings) || !['kerf', 'exL', 'exW'].every(k => num(d.settings[k])) || !num(d.version)) return {};
  const keep = (parts ? d.parts === partsKey(parts) : typeof d.parts === 'string') && okPlan(d);
  return {
    stock: d.stock, settings: d.settings, version: d.version, partsId: String(d.parts ?? ''),
    plan: keep ? d.plan : null, planVersion: keep ? d.planVersion : 0, done: keep ? d.done : {}
  };
}

// ---- Rendering ----

// '!' when parts could not be placed, '•' when stock/settings changed since the plan, else none
export function planBadge(s) {
  if (!s.plan) return null;
  if (s.plan.unplaced.length) return { glyph: '!', cls: 'badge warn', label: 'parts not placed' };
  if (s.version !== s.planVersion) return { glyph: '•', cls: 'badge', label: 'out of date' };
  return null;
}

export function tabBar(s) {
  const b = planBadge(s);
  const btn = (key, label, badge) => `<button type="button" role="tab" class="tab" data-action="tab" data-tab="${key}"`
    + ` aria-selected="${s.tab === key}">${label}`
    + (badge ? `<span class="${badge.cls}" aria-label="${badge.label}">${badge.glyph}</span>` : '') + '</button>';
  return `<nav class="tabbar" role="tablist">${btn('stock', 'Stock')}${btn('plan', 'Plan', b)}</nav>`;
}

const dims = x => [x.t, x.w, x.l].map(esc).join('<span class="x"> × </span>');
const thicknesses = parts => [...new Set(parts.map(p => p.t))].sort((a, b) => b - a);
export const settingsSummary = s =>
  `kerf ${s.settings.kerf} · +${s.settings.exL} L · +${s.settings.exW} W ${s.settingsOpen ? '▴' : '▾'}`;

function projectHeader(s) {
  if (s.partsError) return `<section class="stack8">
    <div class="kicker">Project</div>
    <div class="warn-box" role="alert"><div class="warn-head"><span class="warn-dot">!</span><span class="warn-title">Part list not loaded</span></div>
      <p class="warn-text">${esc(s.partsError)}</p>
      <p class="warn-text">You can still enter stock. Fix parts.json to calculate a plan.</p></div>
  </section>`;
  const total = s.parts.reduce((a, p) => a + p.n, 0);
  const list = !s.partsOpen ? '' : `<div class="card parts">
    <div class="parts-row head"><span>Part</span><span>T × W × L mm</span><span>Qty</span></div>
    ${s.parts.map(p => `<div class="parts-row"><span class="name">${esc(p.name)}</span>`
      + `<span class="num">${[p.t, p.w, p.l].map(esc).join(X)}</span><span class="num">×${esc(p.n)}</span></div>`).join('')}
  </div>`;
  return `<section class="stack8">
    <div class="kicker">Project</div>
    <h1 class="title">${esc(s.project)}</h1>
    <button type="button" id="parts-toggle" class="card toggle" data-action="parts" aria-expanded="${s.partsOpen}">
      <span>${plural(total, 'part')} · ${plural(thicknesses(s.parts).length, 'thickness', 'thicknesses')}</span>
      <span class="toggle-label">${s.partsOpen ? 'Hide ▴' : 'Show list ▾'}</span>
    </button>
    ${list}
  </section>`;
}

function stockRow(s, x) {
  const up = unitPrice(x);
  const price = x.price == null ? 'no price' : x.unit === 'pc' ? `${eur(x.price)} / piece` : `${eur(x.price)} / m³ · ${eur(up)} / piece`;
  const cls = 'row' + (s.flashId === x.id ? ' flash' : '') + (s.editId === x.id ? ' editing' : '');
  return `<div class="swipe${s.openId === x.id ? ' open' : ''}" data-id="${x.id}">
    <button type="button" class="del" data-action="del" data-id="${x.id}">Delete</button>
    <button type="button" class="${cls}" data-action="row" data-id="${x.id}">
      <span class="row-main"><span class="dims">${dims(x)}</span><span class="meta">${m3(volume(x))} m³ · ${price}</span></span>
      <span class="avail"><span class="avail-n">${x.count == null ? '∞' : '×' + esc(x.count)}</span><span class="avail-cap">avail.</span></span>
    </button>
  </div>`;
}

function stockList(s) {
  if (!s.stock.length) return `<div class="empty">
    <div class="h2">No stock entered yet</div>
    <p>Walk the yard and enter each slab size the mill has today using the fields below. The thickness stays filled in for the next board.</p>
    ${s.parts.length ? `<div class="stack6"><div class="kicker">Your parts need</div>
      <div class="chips">${thicknesses(s.parts).map(t => `<span class="chip">${esc(t)} mm</span>`).join('')}</div></div>` : ''}
    <div class="start">↓ Start with the thickness</div>
  </div>`;
  return `<div class="stack8">${s.stock.map(x => stockRow(s, x)).join('')}
    <div class="hint">Tap an entry to edit · swipe left to delete</div></div>`;
}

function settingsCard(s) {
  const fields = [['kerf', 'Saw kerf'], ['exL', 'Extra length'], ['exW', 'Extra width']].map(([key, label]) =>
    `<label class="setting"><span class="cap">${label}</span><span class="box">`
    + `<input id="set-${key}" data-setting="${key}" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" value="${esc(s.settings[key])}">`
    + `<span class="unit">mm</span></span></label>`).join('');
  return `<section class="card">
    <button type="button" id="settings-toggle" class="settings-head" data-action="settings" aria-expanded="${s.settingsOpen}">
      <span>Cutting settings</span><span id="settings-sum" class="muted">${settingsSummary(s)}</span>
    </button>
    ${s.settingsOpen ? `<div class="settings">${fields}</div>` : ''}
  </section>`;
}

function dock(s) {
  const f = s.form, editing = s.editId != null;
  const field = (key, label, enter) => `<label class="field"><span class="cap">${label}</span>`
    + `<input id="f-${key}" data-form="${key}" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="${enter}"`
    + ` placeholder="mm" autocomplete="off" value="${esc(f[key])}"></label>`;
  const inf = f.count == null;
  return `<div class="dock">
    <div class="dock-head"><span class="kicker">${editing ? 'Edit stock entry' : 'Add stock · mm'}</span>
      ${editing ? '<button type="button" id="cancel" class="link" data-action="cancel">Cancel</button>' : ''}</div>
    <div class="grid3">${field('t', 'Thick', 'next')}${field('w', 'Width', 'next')}${field('l', 'Length', 'done')}</div>
    <div class="dock-row">
      <div class="stepper">
        <button type="button" id="dec" data-action="count" data-op="dec" aria-label="Fewer">−</button>
        <span class="count" aria-label="Count">${inf ? '∞' : esc(f.count)}</span>
        <button type="button" id="inc" data-action="count" data-op="inc" aria-label="More">+</button>
        <button type="button" id="inf" class="inf" data-action="count" data-op="inf" aria-label="Unlimited" aria-pressed="${inf}">∞</button>
      </div>
      <label class="price"><span class="euro">€</span>
        <input id="f-price" data-form="price" type="text" inputmode="decimal" enterkeyhint="done" placeholder="0" autocomplete="off" aria-label="Price" value="${esc(f.price)}">
        <button type="button" id="unit" class="unit-btn" data-action="unit">${f.unit === 'pc' ? '/ pc' : '/ m³'}</button>
      </label>
      <button type="button" id="add" class="add" data-action="add"${canAdd(f) ? '' : ' disabled'}>${editing ? 'Save' : 'Add'}</button>
    </div>
    <button type="button" id="calc" class="cta" data-action="calc"${canCalc(s) ? '' : ' disabled'}>Calculate cutting plan</button>
  </div>`;
}

const stockScreen = s => `<main class="screen"><div class="scroll stock">
    ${projectHeader(s)}
    <section class="stack8">
      <div class="section-head"><h2 class="h2">Stock at the mill</h2>${s.stock.length ? `<span class="muted">${plural(s.stock.length, 'size')}</span>` : ''}</div>
      ${stockList(s)}
    </section>
    ${settingsCard(s)}
  </div>${dock(s)}</main>`;

// ---- Plan transitions ----

// One selected part app-wide; tapping it again (drawing or list) clears it.
export const selectPart = (s, uid) => ({ selectedPartUid: s.selectedPartUid === uid ? null : uid });
export const toggleDone = (s, uid) => ({ done: { ...s.done, [uid]: !s.done[uid] } });
export const toggleZoom = (s, i) => ({ zoom: { ...s.zoom, [i]: !s.zoom[i] } });

// ---- Plan rendering ----

const dimsText = (...v) => v.map(esc).join(X);
const partName = p => esc(p.name + (p.copy ? ' ' + p.copy : ''));

function summary(s, t) {
  const stat = (label, value) => `<div class="stat"><span class="stat-cap">${label}</span><span class="stat-n">${value}</span></div>`;
  return `<section class="summary">
    <div class="stack6"><span class="kicker">${s.project ? esc(s.project) + ' · ' : ''}cutting plan</span><span class="buy">Buy ${plural(t.slabCount, 'slab')}</span></div>
    <div class="stats">${stat('Volume', `${t.volumeM3.toFixed(3)} m³`)}${stat('Waste', t.slabCount ? `${Math.round(t.wastePct)} %` : '—')}`
    + `${t.price != null ? stat('Total', eur(t.price)) : ''}</div>
    ${t.price != null && t.unpricedSlabs ? `<span class="excl">Total excludes ${plural(t.unpricedSlabs, 'slab')} without a price</span>` : ''}
  </section>`;
}

// One row per distinct unplaced part (name + size), with the stock size the mill would need.
function unplacedBlock(un) {
  if (!un.length) return '';
  const groups = {};
  un.forEach(p => { (groups[[p.name, p.t, p.cw, p.cl].join('|')] ||= { p, n: 0 }).n++; });
  return `<section class="warn-box">
    <div class="warn-head"><span class="warn-dot">!</span><span class="warn-title">${plural(un.length, 'part')} can't be cut from the stock entered</span></div>
    <p class="warn-text">Ask the mill for stock at least this size (T × W × L, allowances included):</p>
    <div>${Object.values(groups).map(({ p, n }) => `<div class="unplaced-row">`
      + `<span class="u-head"><span class="u-name">${esc(p.name)}</span><span class="u-n">×${n}</span></span>`
      + `<span class="u-need">≥ ${dimsText(p.t, p.cw, p.cl)}</span><span class="meta">${esc(p.reason)}</span></div>`).join('')}</div>
  </section>`;
}

// One row per stock entry used, in stock-list order (slabs are sorted by stockIdx).
function shoppingList(slabs) {
  const groups = {};
  slabs.forEach(sl => (groups[sl.stockIdx] ||= []).push(sl));
  return `<section class="card shop"><div class="kicker">Shopping list</div>
    ${Object.values(groups).map(g => `<div class="shop-row"><span class="shop-n">${g.length} ×</span>`
      + `<span class="shop-dims">${dimsText(g[0].t, g[0].w, g[0].l)}</span>`
      + `<span class="shop-price">${g[0].price == null ? 'no price' : eur(g[0].price * g.length)}</span></div>`).join('')}
  </section>`;
}

// The drawing IS the plan: an SVG whose viewBox is the slab in mm (length along x) and one
// <rect data-uid> per part at the plan's x, y, cut length, cut width. test.html reads it back.
// Labels are HTML on top (SVG text would scale with the slab); they let taps through to the rect.
function slabCard(s, sl, si) {
  const zoom = !!s.zoom[si], sv = volume(sl);
  const pv = sl.parts.reduce((a, pp) => a + volume(pp.p), 0);
  const doneN = sl.parts.filter(pp => s.done[pp.p.uid]).length, all = doneN === sl.parts.length;
  const pct = (v, of) => `${v / of * 100}%`;
  let info = '<span class="info">Tap a part in the drawing</span>';
  const rects = [], labels = [], rows = [];
  sl.parts.forEach(({ p, x, y }, i) => {
    const sel = s.selectedPartUid === p.uid, done = !!s.done[p.uid], st = sel ? ' sel' : done ? ' done' : '';
    if (sel) info = `<span class="info sel">${i + 1} · ${partName(p)} — ${dimsText(p.t, p.w, p.l)} · at ${fmt(x)} along, ${fmt(y)} across</span>`;
    rects.push(`<rect class="part${st}" data-action="sel" data-uid="${p.uid}" x="${x}" y="${y}" width="${p.cl}" height="${p.cw}"/>`);
    labels.push(`<span class="plabel${st}" style="left:${pct(x, sl.l)};top:${pct(y, sl.w)};width:${pct(p.cl, sl.l)};height:${pct(p.cw, sl.w)}">`
      + `${i + 1}${zoom ? '  ' + partName(p) : ''}</span>`);
    rows.push(`<div class="prow${sel ? ' sel' : ''}${done ? ' done' : ''}">
      <button type="button" id="done-${p.uid}" class="tick" data-action="done" data-uid="${p.uid}" aria-label="Mark as cut" aria-pressed="${done}"><span class="box">${done ? '✓' : ''}</span></button>
      <button type="button" id="sel-${p.uid}" class="pick" data-action="sel" data-uid="${p.uid}">
        <span class="pname"><span class="pnum">${i + 1}</span><span class="pn">${partName(p)}</span></span>
        <span class="meta">${dimsText(p.t, p.w, p.l)} · cut ${p.cw}${X}${p.cl}${sl.t > p.t ? ` · plane ${sl.t}→${esc(p.t)}` : ''}</span>
      </button>
    </div>`);
  });
  return `<section class="card slab">
    <div class="slab-head"><span class="slab-num">${si + 1}</span>
      <span class="slab-main"><span class="slab-dims">${dimsText(sl.t, sl.w, sl.l)}</span>`
    + `<span class="meta">${m3(sv)} m³ · ${Math.round((1 - pv / sv) * 100)}% waste${sl.price != null ? ' · ' + eur(sl.price) : ''}</span></span>
      <span class="prog${all ? ' all' : ''}">${doneN}/${sl.parts.length} cut</span></div>
    <div class="hscroll" id="draw-${si}"><div class="draw${zoom ? ' zoomed' : ''}">`
    + `<svg viewBox="0 0 ${sl.l} ${sl.w}" style="aspect-ratio:${sl.l} / ${sl.w}" role="img" aria-label="Slab ${si + 1} cutting layout">${rects.join('')}</svg>`
    + `${labels.join('')}</div></div>
    <div class="slab-info">${info}<button type="button" id="zoom-${si}" class="zoom" data-action="zoom" data-slab="${si}">${zoom ? 'Fit' : 'Zoom'}</button></div>
    <div class="prows">${rows.join('')}</div>
  </section>`;
}

// A screen is <main class="screen"> holding a .scroll area and an optional .dock.
function planScreen(s) {
  if (!s.plan) return `<main class="screen"><div class="scroll noplan">
    <div class="noplan-title">No plan yet</div>
    <p>Enter the stock the mill has on the Stock tab, then calculate.</p>
    <button type="button" class="card goto" data-action="tab" data-tab="stock">Go to Stock</button>
  </div></main>`;
  const { slabs, unplaced, totals } = s.plan;
  const stale = s.version === s.planVersion ? '' : `<div class="stale"><span>Stock or settings changed since this plan was made.</span>`
    + `<button type="button" id="recalc" class="recalc" data-action="calc"${canCalc(s) ? '' : ' disabled'}>Recalculate</button></div>`;
  return `<main class="screen"><div class="scroll plan">
    ${stale}${summary(s, totals)}${unplacedBlock(unplaced)}
    ${slabs.length ? `${shoppingList(slabs)}
      <div class="section-head slabs-head"><h2 class="h2">Slabs</h2><span class="muted">Tap a part to identify it</span></div>
      ${slabs.map((sl, i) => slabCard(s, sl, i)).join('')}` : ''}
  </div><div class="dock plan-dock">
    <button type="button" id="adjust" class="adjust" data-action="tab" data-tab="stock">‹ Adjust stock</button>
  </div></main>`;
}

export const render = s => (s.tab === 'plan' ? planScreen(s) : stockScreen(s)) + tabBar(s);

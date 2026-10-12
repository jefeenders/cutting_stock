// Stock Cutting — state and rendering. Pure functions, no DOM access, so Node checks
// (view.check.js) and a browser test page can drive any state:
//   - transitions: (state, ...) -> patch for app.js set(), or null when nothing changes
//   - render: state -> HTML string
// Clickable elements carry data-action (plus data-* arguments); app.js dispatches them.
// All user-provided text (part names, numbers typed in) goes through esc().

import { DEFAULT_SETTINGS, EXAMPLE_PARTS, makePlan, volume, unitPrice } from './cutting-plan.js';

// State shape follows README "State". version is bumped on every stock/settings change;
// the plan is stale when it was made at another version.
// Form fields hold the strings as typed; stock entries hold numbers.
export const initialState = () => ({
  tab: 'stock',
  parts: EXAMPLE_PARTS, // ponytail: example BOM until parts.json loading (sc-tjk.7)
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

export function calculate(s) {
  if (!s.stock.length) return null;
  return {
    plan: makePlan(s.parts, s.stock, s.settings), planVersion: s.version, tab: 'plan',
    openId: null, selectedPartUid: null, done: {}, zoom: {}
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
  const total = s.parts.reduce((a, p) => a + p.n, 0);
  const list = !s.partsOpen ? '' : `<div class="card parts">
    <div class="parts-row head"><span>Part</span><span>T × W × L mm</span><span>Qty</span></div>
    ${s.parts.map(p => `<div class="parts-row"><span class="name">${esc(p.name)}</span>`
      + `<span class="num">${[p.t, p.w, p.l].map(esc).join(X)}</span><span class="num">×${esc(p.n)}</span></div>`).join('')}
  </div>`;
  return `<section class="stack8">
    <div class="kicker">Project</div>
    <h1 class="title">Workbench</h1>
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
    <div class="stack6"><div class="kicker">Your parts need</div>
      <div class="chips">${thicknesses(s.parts).map(t => `<span class="chip">${esc(t)} mm</span>`).join('')}</div></div>
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
    <button type="button" id="calc" class="cta" data-action="calc"${s.stock.length ? '' : ' disabled'}>Calculate cutting plan</button>
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

// Placeholder until the Plan screen (sc-tjk.4) lands.
// A screen is <main class="screen"> holding a .scroll area and an optional .dock.
const planScreen = s => `<main class="screen"><div class="scroll"><h1>Plan</h1></div></main>`;

export const render = s => (s.tab === 'plan' ? planScreen(s) : stockScreen(s)) + tabBar(s);

// Self-check for view.js (app shell, tab bar, Stock and Plan screens). Run: node view.check.js
import assert from 'node:assert/strict';
import {
  render, esc, initialState, cleanDigits, cleanPrice, canAdd, submitStock, startEdit, cancelEdit,
  deleteStock, stepCount, toggleUnit, setSetting, calculate, selectPart, toggleDone, toggleZoom,
  serialize, restore, parseParts, startWith
} from './view.js';
import { readFileSync } from 'node:fs';
import { EXAMPLE_PARTS, EXAMPLE_STOCK, EXAMPLE_STOCK_WARNING } from './cutting-plan.js';
import { checkPlan } from './check.js';

const S = patch => ({ ...initialState(), project: 'Workbench', parts: EXAMPLE_PARTS, ...patch });
const tab = (html, key) => html.match(new RegExp(`<button[^>]*role="tab"[^>]*data-tab="${key}"[^]*?</button>`))[0];
const plan = (unplaced = []) => ({ slabs: [], unplaced, totals: {} });

// active tab is marked, the other is not
let html = render(S({ tab: 'stock' }));
assert.match(tab(html, 'stock'), /aria-selected="true"/);
assert.match(tab(html, 'plan'), /aria-selected="false"/);
html = render(S({ tab: 'plan' }));
assert.match(tab(html, 'plan'), /aria-selected="true"/);
assert.match(tab(html, 'stock'), /aria-selected="false"/);

// plan badge: none without a plan or when fresh, '!' for unplaced parts (wins over stale), '•' when stale
const badge = st => tab(render(S(st)), 'plan').match(/class="badge[^"]*"[^>]*>([^<]*)</)?.[1];
assert.equal(badge({}), undefined);
assert.equal(badge({ plan: plan(), version: 3, planVersion: 3 }), undefined);
assert.equal(badge({ plan: plan(), version: 4, planVersion: 3 }), '•');
assert.equal(badge({ plan: plan([{ uid: 'p0' }]), version: 3, planVersion: 3 }), '!');
assert.equal(badge({ plan: plan([{ uid: 'p0' }]), version: 4, planVersion: 3 }), '!');
assert.equal(tab(html, 'stock').includes('badge'), false);

// escaping
assert.equal(esc(`<b a="1" b='2'>&</b>`), '&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;&lt;/b&gt;');
assert.equal(esc(0), '0');
assert.equal(esc(null), '');

// ---- Stock screen: state transitions ----
assert.equal(cleanDigits('12a3.4'), '1234');
assert.equal(cleanDigits('1234567'), '12345');
assert.equal(cleanPrice('€1,5x0'), '1,50');
assert.equal(cleanPrice('12345678'), '1234567');

const F = patch => ({ t: '', w: '', l: '', count: 1, price: '', unit: 'pc', ...patch });
assert.equal(canAdd(F({ t: '50', w: '200', l: '2000' })), true);
assert.equal(canAdd(F({ t: '50', w: '0', l: '2000' })), false);
assert.equal(canAdd(F({ t: '50', w: '200' })), false);

// add: append with a fresh id, keep T and unit, clear the rest, flash, bump version
let s = S({ version: 2 });
let p = submitStock({ ...s, form: F({ t: '50', w: '200', l: '2000', count: 3, price: '12,5', unit: 'm3' }) });
assert.deepEqual(p.stock, [{ id: 1, t: 50, w: 200, l: 2000, count: 3, price: 12.5, unit: 'm3' }]);
assert.deepEqual(p.form, F({ t: '50', unit: 'm3' }));
assert.equal(p.flashId, 1);
assert.equal(p.version, 3);
s = { ...s, ...p };
s = { ...s, ...submitStock({ ...s, form: F({ t: '50', w: '300', l: '2500', count: null }) }) };
assert.deepEqual(s.stock.map(x => [x.id, x.w, x.count, x.price]), [[1, 200, 3, 12.5], [2, 300, null, null]]);
assert.equal(submitStock({ ...s, form: F({ t: '50', w: '300' }) }), null); // incomplete → no-op

// same T × W × L merges: counts add (unlimited wins), a new price replaces the old
p = submitStock({ ...s, form: F({ t: '50', w: '200', l: '2000', count: 2 }) });
assert.equal(p.stock.length, 2);
assert.deepEqual([p.stock[0].count, p.stock[0].price, p.stock[0].unit], [5, 12.5, 'm3']);
assert.equal(p.flashId, 1);
p = submitStock({ ...s, form: F({ t: '50', w: '300', l: '2500', count: 4, price: '99' }) });
assert.deepEqual([p.stock[1].count, p.stock[1].price, p.stock[1].unit], [null, 99, 'pc']);

// edit: load into the form, save replaces in place and leaves edit mode; cancel clears W/L
p = startEdit(s, 2);
assert.equal(p.editId, 2);
assert.deepEqual(p.form, F({ t: '50', w: '300', l: '2500', count: null }));
const e = { ...s, ...p, openId: 1 };
p = submitStock({ ...e, form: { ...e.form, l: '2600', count: 2 } });
assert.deepEqual(p.stock.map(x => [x.id, x.l, x.count]), [[1, 2000, 3], [2, 2600, 2]]);
assert.equal(p.editId, null);
assert.equal(p.openId, null);
assert.equal(p.flashId, 2);
assert.equal(p.version, e.version + 1);
assert.deepEqual(cancelEdit(e), { editId: null, form: F({ t: '50' }) });

// delete: removes, leaves edit mode if it was being edited, bumps version
p = deleteStock(e, 2);
assert.deepEqual(p.stock.map(x => x.id), [1]);
assert.equal(p.editId, null);
assert.equal(p.openId, null);
assert.equal(p.version, e.version + 1);
assert.equal(deleteStock(e, 1).editId, 2);

// count stepper: − floors at 1, ∞ toggles, −/+ while unlimited → 1; unit toggles
assert.equal(stepCount(F({ count: 1 }), 'dec').count, 1);
assert.equal(stepCount(F({ count: 3 }), 'dec').count, 2);
assert.equal(stepCount(F({ count: 3 }), 'inc').count, 4);
assert.equal(stepCount(F({ count: 3 }), 'inf').count, null);
assert.equal(stepCount(F({ count: null }), 'inf').count, 1);
assert.equal(stepCount(F({ count: null }), 'inc').count, 1);
assert.equal(stepCount(F({ count: null }), 'dec').count, 1);
assert.equal(toggleUnit(F()).unit, 'm3');
assert.equal(toggleUnit(F({ unit: 'm3' })).unit, 'pc');

// settings: digits only, empty → 0, bump version only on a real change
p = setSetting(s, 'kerf', '3x');
assert.deepEqual(p.settings, { ...s.settings, kerf: 3 });
assert.equal(p.version, s.version + 1);
assert.equal(setSetting(s, 'exL', '').settings.exL, 0);
assert.equal(setSetting(s, 'kerf', String(s.settings.kerf)), null);

// calculate: plan from parts + stock + settings, stamped with the version, switch to Plan
assert.equal(calculate(S()), null);
p = calculate({ ...s, selectedPartUid: 'p1', done: { p1: true }, zoom: { 0: true } });
assert.equal(p.tab, 'plan');
assert.equal(p.planVersion, s.version);
assert.ok(p.plan.slabs.length > 0);
assert.deepEqual([p.selectedPartUid, p.done, p.zoom], [null, {}, {}]);

// ---- Stock screen: rendering ----
const STOCK = [
  { id: 1, t: 100, w: 260, l: 2400, count: 2, price: 310, unit: 'pc' },
  { id: 2, t: 90, w: 300, l: 3000, count: null, price: 2400, unit: 'm3' },
  { id: 3, t: 50, w: 280, l: 2500, count: 1, price: null, unit: 'pc' }
];
const text = h => h.replace(/<[^>]*>/g, '');
html = render(S({ stock: STOCK }));
assert.match(text(html), /100 × 260 × 2400/);
assert.match(text(html), /0\.062 m³ · €310 \/ piece/);
assert.match(text(html), /0\.081 m³ · €2,400 \/ m³ · €194 \/ piece/);
assert.match(text(html), /0\.035 m³ · no price/);
assert.match(text(html), /×2\s*avail\./i);
assert.match(text(html), /∞\s*avail\./i);
assert.match(text(html), /3 sizes/);
assert.match(text(html), /Tap an entry to edit · swipe left to delete/);
assert.doesNotMatch(text(html), /No stock entered yet/);
assert.match(html, /<button[^>]*id="calc"(?![^>]*disabled)[^>]*>/);
assert.match(text(html), /14 parts · 5 thicknesses/);
assert.match(text(html), /kerf 4 · \+20 L · \+5 W ▾/);
// open, flashed and edited rows are marked
html = render(S({ stock: STOCK, editId: 2, openId: 3, flashId: 1 }));
assert.match(html, /class="swipe open" data-id="3"/);
assert.match(html, /class="row flash" data-action="row" data-id="1"/);
assert.match(html, /class="row editing" data-action="row" data-id="2"/);
assert.match(text(html), /Edit stock entry/i);
assert.match(text(html), /Save/);
assert.match(text(html), /Cancel/);

// empty state: thickness chips descending, no size counter, Calculate and Add disabled
html = render(S());
assert.match(text(html), /No stock entered yet/);
assert.deepEqual([...html.matchAll(/class="chip">([^<]*)</g)].map(m => m[1]), ['100 mm', '90 mm', '80 mm', '45 mm', '40 mm']);
assert.doesNotMatch(text(html), /\d sizes?\b/);
assert.match(html, /id="calc"[^>]*disabled/);
assert.match(html, /id="add"[^>]*disabled/);
assert.match(text(html), /Add stock · mm/i);
assert.match(html, /id="f-t"[^>]*value=""/);

// part list toggle
assert.doesNotMatch(render(S()), /Tischplatte_hinten/);
html = render(S({ partsOpen: true }));
assert.match(text(html), /Hide ▴/);
assert.match(text(html), /Leg\s*90 × 130 × 725\s*×4/);
assert.match(text(render(S())), /Show list ▾/);

// user text is escaped
html = render(S({ partsOpen: true, parts: [{ name: '<img src=x>', t: 1, w: 2, l: 3, n: 1 }], form: F({ t: '"><b>' }) }));
assert.doesNotMatch(html, /<img src=x>|"><b>/);
assert.match(html, /&lt;img src=x&gt;/);


// ---- Plan screen ----
// no plan yet
html = render(S({ tab: 'plan' }));
assert.match(text(html), /No plan yet/);
assert.match(text(html), /Enter the stock the mill has on the Stock tab, then calculate\./);
assert.match(html, /<button[^>]*data-action="tab" data-tab="stock"[^>]*>Go to Stock</);
assert.doesNotMatch(html, /<svg/);

const planned = stock => { const s0 = S({ stock }); return { ...s0, ...calculate(s0) }; };
const full = planned(EXAMPLE_STOCK), warn = planned(EXAMPLE_STOCK_WARNING);
const rows = (h, cls) => [...h.matchAll(new RegExp(`<div class="${cls}">([^]*?)</div>`, 'g'))].map(m => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

// summary: 2×(100·260·2400) + 90·300·3000 + 2×(50·280·2500) = 0.2758 m³; €310·2 + €2400·0.081 + 2·€2100·0.035 = €961.4
html = render(full);
assert.match(text(html), /Workbench · cutting plan/i);
assert.match(text(html), /Buy 5 slabs/);
assert.match(text(html), /Volume\s*0\.276 m³/);
assert.match(text(html), /Waste\s*34 %/);
assert.match(text(html), /Total\s*€961/);
assert.doesNotMatch(text(html), /Total excludes/);
assert.doesNotMatch(text(html), /changed since this plan/);
assert.doesNotMatch(text(html), /can't be cut/);
assert.deepEqual(rows(html, 'shop-row'), ['2 × 100 × 260 × 2400 €620', '1 × 90 × 300 × 3000 €194', '2 × 50 × 280 × 2500 €147']);
assert.match(text(html), /Slabs\s*Tap a part to identify it/);
assert.match(html, /data-action="tab" data-tab="stock"[^>]*>‹ Adjust stock</);
// slab cards: header, meta, progress; parts numbered per slab, plane hint when the slab is thicker
assert.match(text(html), /3\s*90 × 300 × 3000\s*0\.081 m³ · \d+% waste · €194\s*0\/5 cut/);
assert.match(text(html), /2\s*Leg 2\/4\s*90 × 130 × 725 · cut 135 × 745(?! · plane)/);
assert.match(text(html), /1\s*Leg_Vise_Body\s*45 × 247 × 755 · cut 252 × 775 · plane 50→45/);
assert.equal((html.match(/Tap a part in the drawing/g) || []).length, 5);

// stale banner only when stock/settings changed after the plan
assert.match(text(render({ ...full, version: full.version + 1 })), /Stock or settings changed since this plan was made\.\s*Recalculate/);
assert.match(render({ ...full, version: full.version + 1 }), /<button[^>]*data-action="calc"[^>]*>Recalculate</);
assert.doesNotMatch(render({ ...full, planVersion: full.version }), /Recalculate/);

// warning scenario: one row per distinct unplaced part, required size includes allowances
html = render(warn);
assert.match(text(html), /Buy 4 slabs/);
assert.match(text(html), /Total\s*€341\s*Total excludes 1 slab without a price/);
assert.match(text(html), /2 parts can't be cut from the stock entered/);
assert.match(text(html), /Ask the mill for stock at least this size \(T × W × L, allowances included\):/);
assert.deepEqual(rows(html, 'unplaced-row'), [
  'Tischplatte_hinten ×1 ≥ 100 × 260 × 2296 No stock 100 mm or thicker',
  'Tischplatte_vorn ×1 ≥ 100 × 220 × 2252 No stock 100 mm or thicker'
]);
assert.deepEqual(rows(html, 'shop-row'), ['1 × 90 × 300 × 3000 €194', '2 × 50 × 280 × 2500 €147', '1 × 50 × 240 × 1500 no price']);
assert.match(text(render(planned([{ id: 1, t: 10, w: 10, l: 10, count: 1, price: null, unit: 'pc' }]))), /Buy 0 slabs\s*Volume\s*0\.000 m³\s*Waste\s*—/);

// round trip: the drawing is the plan. viewBox = slab in mm, one rect per part at plan x/y/cl/cw.
function readPlan(h, plan) {
  const byUid = Object.fromEntries(plan.slabs.flatMap(sl => sl.parts.map(pp => [pp.p.uid, pp.p])));
  return [...h.matchAll(/<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*>([^]*?)<\/svg>/g)].map(([, l, w, inner]) => ({
    l: +l, w: +w,
    parts: [...inner.matchAll(/<rect[^>]*data-uid="([^"]+)"[^>]*>/g)].map(([r, uid]) => {
      const a = n => +r.match(new RegExp(` ${n}="([^"]+)"`))[1];
      return { uid, x: a('x'), y: a('y'), cl: a('width'), cw: a('height'), p: byUid[uid] };
    })
  }));
}
for (const st of [full, warn]) {
  const drawn = readPlan(render(st), st.plan);
  const brief = slabs => slabs.map(sl => ({ l: sl.l, w: sl.w, parts: sl.parts.map(pp => [pp.p.uid, pp.x, pp.y, pp.p.cl, pp.p.cw]) }));
  assert.deepEqual(brief(drawn), brief(st.plan.slabs));
  const rebuilt = { ...st.plan, slabs: st.plan.slabs.map((sl, i) => ({ ...sl, parts: drawn[i].parts.map(({ p, x, y }) => ({ p, x, y })) })) };
  checkPlan(st.parts, st.stock, st.settings, rebuilt);
}

// selection: one part app-wide, toggles; drawing and list both mark it, info line gives the offset
const leg2 = full.plan.slabs[2].parts[1].p.uid;
assert.deepEqual(selectPart(full, leg2), { selectedPartUid: leg2 });
assert.deepEqual(selectPart({ ...full, selectedPartUid: leg2 }, leg2), { selectedPartUid: null });
assert.deepEqual(selectPart({ ...full, selectedPartUid: 'p0' }, leg2), { selectedPartUid: leg2 });
html = render({ ...full, selectedPartUid: leg2 });
assert.match(html, new RegExp(`<rect class="part sel"[^>]*data-uid="${leg2}"`));
assert.equal((html.match(/class="part sel"/g) || []).length, 1);
assert.match(html, new RegExp(`class="prow sel"[^]*?data-uid="${leg2}"`));
assert.match(text(html), /2 · Leg 2\/4 — 90 × 130 × 725 · at 749 along, 0 across/);
assert.equal((html.match(/Tap a part in the drawing/g) || []).length, 4);

// cut ticks: per part instance, progress pill fills when the slab is done
assert.deepEqual(toggleDone(full, 'p0'), { done: { p0: true } });
assert.deepEqual(toggleDone({ ...full, done: { p0: true } }, 'p0'), { done: { p0: false } });
html = render({ ...full, done: { p0: true, p3: true } });
assert.match(html, /<rect class="part done"[^>]*data-uid="p0"/);
assert.match(html, /<button[^>]*data-action="done" data-uid="p0"[^>]*aria-pressed="true"/);
assert.match(html, /<button[^>]*data-action="done" data-uid="p1"[^>]*aria-pressed="false"/);
assert.match(html, /class="prog all">1\/1 cut/);
assert.match(html, /class="prog">1\/5 cut/);

// zoom per slab: label, wider drawing, names on parts; rect coordinates unchanged
assert.deepEqual(toggleZoom(full, 2), { zoom: { 2: true } });
assert.deepEqual(toggleZoom({ ...full, zoom: { 2: true } }, 2), { zoom: { 2: false } });
const zoomed = render({ ...full, zoom: { 2: true } });
assert.equal((zoomed.match(/data-action="zoom"[^>]*>Fit</g) || []).length, 1);
assert.equal((zoomed.match(/data-action="zoom"[^>]*>Zoom</g) || []).length, 4);
assert.match(zoomed, /class="draw zoomed"/);
assert.match(text(zoomed), /2\s+Leg/);
assert.deepEqual(readPlan(zoomed, full.plan), readPlan(render(full), full.plan));

// part names in the plan are escaped
const evil = S({ parts: [{ name: '<i>x', t: 40, w: 50, l: 60, n: 1 }], stock: EXAMPLE_STOCK });
html = render({ ...evil, ...calculate(evil), selectedPartUid: 'p0', zoom: { 0: true } });
assert.doesNotMatch(html, /<i>x/);
assert.match(html, /&lt;i&gt;x/);

// ---- Persistence (localStorage) ----
// round trip: stock, settings, plan, versions and ticks survive; UI state does not
const saved = { ...full, settings: { kerf: 3, exL: 20, exW: 5 }, version: full.version + 1, done: { p0: true, p3: true },
  tab: 'plan', selectedPartUid: 'p1', zoom: { 1: true }, settingsOpen: true, form: F({ t: '50' }), editId: 1 };
const back = { ...S(), ...restore(serialize(saved), saved.parts) };
for (const k of ['stock', 'settings', 'plan', 'planVersion', 'version', 'done']) assert.deepEqual(back[k], saved[k], k);
for (const k of ['tab', 'selectedPartUid', 'zoom', 'settingsOpen', 'form', 'editId']) assert.deepEqual(back[k], S()[k], k);
// the restored plan (no shared object identity) renders the same and still passes checkPlan
assert.equal(render({ ...back, tab: 'plan' }), render({ ...saved, selectedPartUid: null, zoom: {} }));
checkPlan(back.parts, back.stock, back.settings, back.plan);
const wb = { ...S(), ...restore(serialize(warn), warn.parts) };
assert.equal(render({ ...wb, tab: 'plan' }), render(warn));
checkPlan(wb.parts, wb.stock, wb.settings, wb.plan);
assert.deepEqual(restore(serialize(S()), S().parts), { stock: [], settings: S().settings, plan: null, planVersion: 0, version: 0, done: {}, partsId: JSON.parse(serialize(S())).parts });

// nothing saved, corrupt JSON, wrong schema or bad shapes → defaults (empty patch)
const json = JSON.parse(serialize(saved));
const bad = o => JSON.stringify({ ...json, ...o });
for (const j of [null, '', '{', '"x"', '[]', 'null', bad({ schema: 999 }), bad({ schema: undefined }),
  bad({ stock: 'x' }), bad({ stock: [{ id: 1, t: 'a', w: 1, l: 1 }] }), bad({ stock: [null] }), bad({ settings: null }),
  bad({ settings: { kerf: 4 } }), bad({ version: 'x' })]) assert.deepEqual(restore(j, saved.parts), {}, String(j));
// a broken plan or ticks drop only the plan
for (const o of [{ plan: { slabs: 'x' } }, { plan: 5 }, { done: 'x' }, { planVersion: 'x' }]) {
  const r = restore(bad(o), saved.parts);
  assert.deepEqual([r.plan, r.done, r.stock, r.settings], [null, {}, saved.stock, saved.settings], JSON.stringify(o));
}
// a changed part list drops plan and ticks (uids would point at other parts) but keeps stock and settings
const changed = saved.parts.map((p, i) => (i ? p : { ...p, l: p.l + 1 }));
const r = restore(serialize(saved), changed);
assert.deepEqual([r.plan, r.done, r.stock, r.settings, r.version], [null, {}, saved.stock, saved.settings, saved.version]);
assert.deepEqual(restore(serialize(saved), [...saved.parts].reverse()).plan, null);

// ---- Part list (parts.json) ----
// the committed parts.json is the example BOM
assert.deepEqual(parseParts(readFileSync(new URL('parts.json', import.meta.url), 'utf8')), { project: 'Workbench', parts: EXAMPLE_PARTS });
const PJ = (parts, extra) => JSON.stringify({ project: 'Desk', parts, ...extra });
const leg = { name: 'Leg', t: 40, w: 60, l: 700, n: 4 };
// extra keys are ignored (room for material/grain later), only { name, t, w, l, n } is kept
assert.deepEqual(parseParts(PJ([{ ...leg, material: 'oak' }])), { project: 'Desk', parts: [leg] });
const err = (json, re) => { const r = parseParts(json); assert.deepEqual(Object.keys(r), ['error'], json); assert.match(r.error, re, json); };
err('{', /not valid JSON/);
err('[]', /"project".*"parts"/);
err(PJ(undefined), /"parts"/);
err(PJ([]), /no parts/);
err(JSON.stringify({ parts: [leg] }), /"project"/);
err(PJ([leg], { project: '  ' }), /"project"/);
err(PJ([leg, null]), /Part 2:/);
err(PJ([leg, { ...leg, name: '' }]), /Part 2: name/);
err(PJ([{ ...leg, name: 7 }]), /Part 1: name/);
for (const k of ['t', 'w', 'l']) for (const v of [0, -5, 12.5, '40', null]) err(PJ([leg, { ...leg, [k]: v }]), new RegExp(`Part 2 \\("Leg"\\): ${k} must be a whole number of mm > 0`));
for (const v of [0, 1.5, '2', undefined]) err(PJ([{ ...leg, n: v }]), /Part 1 \("Leg"\): n must be a whole number ≥ 1/);
// t, w, l mean thickness, across, along the grain, not size order: accepted as given, never reordered
const wide = { name: 'Short wide', t: 40, w: 300, l: 200, n: 1 }, thick = { name: 'Thick', t: 60, w: 40, l: 500, n: 2 };
assert.deepEqual(parseParts(PJ([wide, thick])), { project: 'Desk', parts: [wide, thick] });

// project title comes from the part list (Stock header, Plan summary); escaped
assert.match(text(render(S({ project: 'Desk <b>' }))), /Project\s*Desk &lt;b&gt;/);
assert.match(text(render({ ...full, project: 'Desk' })), /Desk · cutting plan/i);

// part list could not be loaded: a clear message, stock entry still works, no calculating
const broken = S({ parts: [], project: '', partsError: 'parts.json not found (HTTP 404)', stock: STOCK });
html = render(broken);
assert.match(text(html), /Part list not loaded\s*parts\.json not found \(HTTP 404\)/);
assert.doesNotMatch(text(html), /0 parts|Show list/);
assert.match(text(html), /100 × 260 × 2400/);
assert.match(html, /<button[^>]*id="add"/);
assert.match(html, /id="calc"[^>]*disabled/);
assert.equal(calculate(broken), null);
html = render({ ...broken, stock: [] });
assert.match(text(html), /No stock entered yet/);
assert.doesNotMatch(text(html), /Your parts need/);
assert.match(render({ ...broken, plan: full.plan, planVersion: 0, version: 1, tab: 'plan' }), /id="recalc"[^>]*disabled/);

// startup: parts first, then the saved data checked against them
const ok = parseParts(PJ([leg]));
const savedJson = serialize(saved);
p = startWith(parseParts(JSON.stringify({ project: 'Workbench', parts: EXAMPLE_PARTS })), savedJson);
assert.deepEqual([p.project, p.parts, p.partsError, p.plan, p.done, p.stock], ['Workbench', EXAMPLE_PARTS, null, saved.plan, saved.done, saved.stock]);
// other parts than when the plan was made: plan, ticks and planVersion dropped, stock and settings kept
p = startWith(ok, savedJson);
assert.deepEqual([p.project, p.parts, p.plan, p.done, p.planVersion, p.stock, p.settings], ['Desk', [leg], null, {}, 0, saved.stock, saved.settings]);
// nothing saved yet
p = startWith(ok, null);
assert.deepEqual([p.parts, p.partsError], [[leg], null]);
assert.equal(p.stock, undefined);
// parts.json broken: stock, settings and the last plan stay (the plan carries its own parts) ...
p = startWith({ error: 'bad' }, savedJson);
assert.deepEqual([p.partsError, p.parts, p.stock, p.plan, p.done], ['bad', [], saved.stock, saved.plan, saved.done]);
// ... and saving in that state keeps the old fingerprint, so a fixed parts.json gets plan and ticks back
const kept = { ...S(), ...p, stock: [...saved.stock, { id: 9, t: 1, w: 1, l: 1, count: 1, price: null, unit: 'pc' }] };
p = startWith(parseParts(JSON.stringify({ project: 'Workbench', parts: EXAMPLE_PARTS })), serialize(kept));
assert.deepEqual([p.plan, p.done, p.stock.length], [saved.plan, saved.done, saved.stock.length + 1]);
// a parts change at runtime goes through the same path: startWith(loaded, serialize(state))
p = startWith(ok, serialize(saved));
assert.deepEqual([p.plan, p.done, p.planVersion], [null, {}, 0]);

console.log('view.check.js: shell, tab bar, stock, plan screen, persistence and part list checks passed');

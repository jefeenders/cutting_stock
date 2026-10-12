// Self-check for view.js (app shell, tab bar, Stock screen). Run: node view.check.js
import assert from 'node:assert/strict';
import {
  render, esc, initialState, cleanDigits, cleanPrice, canAdd, submitStock, startEdit, cancelEdit,
  deleteStock, stepCount, toggleUnit, setSetting, calculate
} from './view.js';

const S = patch => ({ ...initialState(), ...patch });
const tab = (html, key) => html.match(new RegExp(`<button[^>]*data-tab="${key}"[^]*?</button>`))[0];
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

console.log('view.check.js: shell, tab bar and stock screen checks passed');

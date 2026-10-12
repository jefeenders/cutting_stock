// Self-check for view.js (app shell + tab bar). Run: node view.check.js
import assert from 'node:assert/strict';
import { render, esc, initialState } from './view.js';

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

console.log('view.check.js: shell and tab bar checks passed');

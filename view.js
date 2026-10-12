// Stock Cutting — rendering. Pure functions state -> HTML string: no DOM access, so Node checks
// (view.check.js) and a browser test page can render any state. app.js owns the state and the DOM.
// Clickable elements carry data-action (plus data-* arguments); app.js dispatches them.
// All user-provided text (part names, numbers typed in) goes through esc().

import { DEFAULT_SETTINGS } from './cutting-plan.js';

// State shape follows README "State". version is bumped on every stock/settings change;
// the plan is stale when it was made at another version.
export const initialState = () => ({
  tab: 'stock',
  parts: [],
  stock: [],
  settings: { ...DEFAULT_SETTINGS },
  form: { t: '', w: '', l: '', count: 1, price: '', unit: 'pc' },
  editId: null, swipe: { id: null, dx: 0 }, openId: null, flashId: null, focusField: null,
  plan: null, planVersion: 0, version: 0,
  selectedPartUid: null, zoom: {}, done: {},
  partsOpen: false, settingsOpen: false
});

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// '!' when parts could not be placed, '•' when stock/settings changed since the plan, else none
export function planBadge(s) {
  if (!s.plan) return null;
  if (s.plan.unplaced.length) return { glyph: '!', cls: 'badge warn', label: 'parts not placed' };
  if (s.version !== s.planVersion) return { glyph: '•', cls: 'badge', label: 'out of date' };
  return null;
}

function tabBar(s) {
  const b = planBadge(s);
  const btn = (key, label, badge) => `<button type="button" role="tab" class="tab" data-action="tab" data-tab="${key}"`
    + ` aria-selected="${s.tab === key}">${label}`
    + (badge ? `<span class="${badge.cls}" aria-label="${badge.label}">${badge.glyph}</span>` : '') + '</button>';
  return `<nav class="tabbar" role="tablist">${btn('stock', 'Stock')}${btn('plan', 'Plan', b)}</nav>`;
}

// Placeholders until the Stock screen (sc-tjk.3) and Plan screen (sc-tjk.4) land.
// A screen is <main class="screen"> holding a .scroll area and an optional .dock.
const stockScreen = s => `<main class="screen"><div class="scroll"><h1>Stock</h1></div></main>`;
const planScreen = s => `<main class="screen"><div class="scroll"><h1>Plan</h1></div></main>`;

export const render = s => (s.tab === 'plan' ? planScreen(s) : stockScreen(s)) + tabBar(s);

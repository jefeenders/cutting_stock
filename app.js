// Stock Cutting — app: owns the state, renders it with view.js, dispatches events.
// Structural changes go through set(), which re-renders the whole app from state.
// Typing does NOT re-render: a fresh <input> would drop the caret and close the phone keyboard.
// Inputs are uncontrolled; 'input' events copy the cleaned value into state and patch() updates
// the few things that depend on it. Swipe moves the live row and toggles classes, no re-render.
import * as V from './view.js';

const root = document.getElementById('app');
export const state = V.initialState();
const $ = id => document.getElementById(id);

export function set(patch) {
  if (!patch) return;
  const tab = state.tab, scroll = root.querySelector('.scroll')?.scrollTop ?? 0;
  const a = document.activeElement, focusId = root.contains(a) ? a.id : '';
  const sel = a?.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  root.innerHTML = V.render(state);
  // keep scroll position and focus (by element id) across the re-render
  if (state.tab === tab) root.querySelector('.scroll').scrollTop = scroll;
  const el = focusId && $(focusId);
  if (el) { el.focus({ preventScroll: true }); if (sel) el.setSelectionRange(...sel); }
}

// Update what depends on typed values without touching the inputs.
function patch() {
  const add = $('add'), sum = $('settings-sum');
  if (add) add.disabled = !V.canAdd(state.form);
  if (sum) sum.textContent = V.settingsSummary(state);
  root.querySelector('.tabbar').outerHTML = V.tabBar(state);
}

const syncOpen = () => root.querySelectorAll('.swipe').forEach(w => w.classList.toggle('open', +w.dataset.id === state.openId));

let flashTimer;
function flash() {
  clearTimeout(flashTimer);
  // fade out in place (CSS transition) instead of re-rendering
  flashTimer = setTimeout(() => { state.flashId = null; root.querySelector('.row.flash')?.classList.remove('flash'); }, 1400);
}

function submit() {
  const adding = state.editId == null;
  const p = V.submitStock(state);
  if (!p) return;
  set(p);
  flash();
  if (adding) { root.querySelector('.scroll').scrollTop = 1e9; $('f-w').focus(); }
}

// data-action="name" on a clickable element → actions.name(element)
const actions = {
  tab: el => set({ tab: el.dataset.tab }),
  parts: () => set({ partsOpen: !state.partsOpen }),
  settings: () => set({ settingsOpen: !state.settingsOpen }),
  row: el => {
    if (state.openId != null) { state.openId = null; syncOpen(); } // tap closes an open row
    else set(V.startEdit(state, +el.dataset.id));
  },
  del: el => set(V.deleteStock(state, +el.dataset.id)),
  cancel: () => set(V.cancelEdit(state)),
  count: el => set({ form: V.stepCount(state.form, el.dataset.op) }),
  unit: () => set({ form: V.toggleUnit(state.form) }),
  add: submit,
  calc: () => set(V.calculate(state))
};

let dragEnd = 0;
root.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el?.dataset.action === 'row' && e.timeStamp - dragEnd < 400) return; // the swipe's own click
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

root.addEventListener('input', e => {
  const el = e.target, key = el.dataset.form || el.dataset.setting;
  if (!key) return;
  const v = key === 'price' ? V.cleanPrice(el.value) : V.cleanDigits(el.value);
  if (v !== el.value) el.value = v;
  if (el.dataset.form) state.form[key] = v;
  else Object.assign(state, V.setSetting(state, key, v));
  patch();
});

// Enter: T → W → L → submit; price → submit; settings → close the keyboard.
// Delete/Backspace on a focused stock row deletes it (keyboard path for swipe-to-delete).
const NEXT = { 'f-t': 'f-w', 'f-w': 'f-l' };
root.addEventListener('keydown', e => {
  const el = e.target;
  if ((e.key === 'Delete' || e.key === 'Backspace') && el.classList.contains('row')) return actions.del(el);
  if (e.key !== 'Enter' || el.tagName !== 'INPUT') return;
  e.preventDefault();
  if (NEXT[el.id]) $(NEXT[el.id]).focus();
  else if (el.dataset.form) submit();
  else el.blur();
});

root.addEventListener('focusin', e => { if (e.target.dataset.form) e.target.select(); });

// Swipe left on a stock row reveals Delete: follow the finger (0…−130 px), snap open at −88 px
// if dragged past −44 px. Moves under 8 px count as a tap (handled by click).
let drag = null;
root.addEventListener('pointerdown', e => {
  const row = e.target.closest('.row');
  if (row) drag = { row, id: +row.dataset.id, x0: e.clientX, base: state.openId === +row.dataset.id ? -88 : 0, dx: null };
});
root.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0;
  if (drag.dx == null) {
    if (Math.abs(dx) < 8) return;
    drag.row.setPointerCapture(e.pointerId);
    drag.row.parentNode.classList.add('dragging');
  }
  drag.dx = Math.min(0, Math.max(-130, drag.base + dx));
  drag.row.style.transform = `translateX(${drag.dx}px)`;
});
function endDrag(e, cancelled) {
  if (!drag) return;
  if (drag.dx != null) {
    dragEnd = e.timeStamp;
    if (!cancelled) state.openId = drag.dx < -44 ? drag.id : null;
    drag.row.style.transform = '';
    drag.row.parentNode.classList.remove('dragging');
    syncOpen();
  }
  drag = null;
}
root.addEventListener('pointerup', e => endDrag(e, false));
root.addEventListener('pointercancel', e => endDrag(e, true));

set({});

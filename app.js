// Stock Cutting — app: owns the state, renders it with view.js, dispatches clicks.
// Every change goes through set(); it re-renders the whole app from state.
import { render, initialState } from './view.js';

const root = document.getElementById('app');
export const state = initialState();

export function set(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  // ponytail: full innerHTML re-render; keep input focus/scroll in the screen tasks when they need it
  root.innerHTML = render(state);
}

// data-action="name" on a clickable element → actions.name(element)
const actions = {
  tab: el => set({ tab: el.dataset.tab })
};

root.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

set({});

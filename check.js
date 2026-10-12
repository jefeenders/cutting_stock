// Self-check for cutting-plan.js. Run: node check.js
// checkPlan() has no Node-only code so a browser test page can import it; the runner below only
// runs under Node (import.meta.main).

import { makePlan, DEFAULT_SETTINGS, PLANE_TOLERANCE, EXAMPLE_PARTS, EXAMPLE_STOCK, EXAMPLE_STOCK_WARNING } from './cutting-plan.js';

function ok(cond, msg) { if (!cond) throw new Error(msg); }

// Invariants that must hold for any input. Throws on the first violation.
export function checkPlan(parts, stock, set = DEFAULT_SETTINGS, plan) {
  const k = set.kerf, key = p => `${p.name}|${p.t}|${p.w}|${p.l}`;

  // every part instance placed exactly once or listed in unplaced[] with a reason
  const want = {}, uids = new Set();
  parts.forEach(p => { want[key(p)] = (want[key(p)] || 0) + p.n; });
  const placed = plan.slabs.flatMap(sl => sl.parts.map(pp => pp.p));
  for (const p of [...placed, ...plan.unplaced]) {
    ok(!uids.has(p.uid), `part ${p.uid} appears twice`);
    uids.add(p.uid);
    ok(want[key(p)] > 0, `unexpected or surplus part ${key(p)}`);
    want[key(p)]--;
    // cut size = finished + allowance; width across the slab, length along it (no rotation)
    ok(p.cw === p.w + set.exW && p.cl === p.l + set.exL, `${p.uid}: cut ${p.cw}×${p.cl} for ${p.w}×${p.l}`);
  }
  for (const [kk, n] of Object.entries(want)) ok(n === 0, `${n} × ${kk} missing from the plan`);

  // stock: slab matches its entry, count limit respected
  const used = stock.map(() => 0);
  for (const sl of plan.slabs) {
    const s = stock[sl.stockIdx];
    ok(s && s.id === sl.stockId && s.t === sl.t && s.w === sl.w && s.l === sl.l, `slab does not match stock ${sl.stockId}`);
    used[sl.stockIdx]++;
    ok(sl.parts.length > 0, `empty slab of stock ${sl.stockId}`);
  }
  stock.forEach((s, i) => ok(s.count == null || used[i] <= s.count, `stock ${s.id}: ${used[i]} used, ${s.count} available`));

  plan.slabs.forEach((sl, si) => {
    const at = `slab ${si + 1}`;
    for (const { p, x, y } of sl.parts) {
      ok(p.t <= sl.t, `${at}: ${p.uid} is ${p.t} thick, slab ${sl.t}`);
      // a second part may only join a slab at most PLANE_TOLERANCE thicker (the opener may be thinner)
      ok(sl.parts.length === 1 || sl.t - p.t <= PLANE_TOLERANCE, `${at}: ${p.uid} ${p.t} shares a ${sl.t} slab`);
      ok(x >= 0 && y >= 0 && x + p.cl <= sl.l && y + p.cw <= sl.w, `${at}: ${p.uid} at ${x},${y} outside the slab`);
    }
    // guillotine: rip into strips (one y each, width = widest part in it), then crosscut each strip.
    // Strips kerf apart across the width and parts kerf apart along each strip also rule out overlaps.
    const strips = {};
    sl.parts.forEach(pp => (strips[pp.y] ||= []).push(pp));
    const ys = Object.keys(strips).map(Number).sort((a, b) => a - b);
    ys.forEach((y, i) => {
      const row = strips[y].sort((a, b) => a.x - b.x);
      const w = Math.max(...row.map(pp => pp.p.cw));
      ok(i === ys.length - 1 || y + w + k <= ys[i + 1], `${at}: strip at ${y} (w ${w}) too close to strip at ${ys[i + 1]}`);
      row.forEach((pp, j) => ok(j === row.length - 1 || pp.x + pp.p.cl + k <= row[j + 1].x,
        `${at}: ${pp.p.uid} and ${row[j + 1]?.p.uid} less than kerf apart`));
    });
  });

  // nothing left out that a fresh piece of remaining stock could hold
  for (const p of plan.unplaced) {
    ok(typeof p.reason === 'string' && p.reason, `${p.uid} unplaced without a reason`);
    const fit = stock.find((s, i) => (s.count == null || used[i] < s.count) && s.t >= p.t && s.w >= p.cw && s.l >= p.cl);
    ok(!fit, `${p.uid} unplaced but stock ${fit?.id} still fits it`);
  }
  // totals (shown in the Plan summary), recomputed from the slabs and the stock entries they came from
  const t = plan.totals, vol = x => x.t * x.w * x.l, near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  const slabVol = plan.slabs.reduce((a, sl) => a + vol(sl), 0), partVol = placed.reduce((a, p) => a + vol(p), 0);
  const prices = plan.slabs.map(sl => stock[sl.stockIdx])
    .filter(s => s.price != null).map(s => (s.unit === 'pc' ? s.price : s.price * vol(s) / 1e9));
  ok(t.slabCount === plan.slabs.length, 'totals.slabCount wrong');
  ok(near(t.volumeM3, slabVol / 1e9), `totals.volumeM3 ${t.volumeM3}, slabs hold ${slabVol / 1e9}`);
  ok(near(t.wastePct, slabVol ? (1 - partVol / slabVol) * 100 : 0), `totals.wastePct ${t.wastePct} wrong`);
  ok(prices.length ? near(t.price, prices.reduce((a, p) => a + p, 0)) : t.price === null, `totals.price ${t.price} wrong`);
  ok(t.unpricedSlabs === plan.slabs.length - prices.length, 'totals.unpricedSlabs wrong');
}

// ---------------------------------------------------------------- Node runner

if (import.meta.main) {
  const { default: assert } = await import('node:assert/strict');
  const P = (name, t, w, l, n = 1) => ({ name, t, w, l, n });
  const S = (id, t, w, l, count = null, price = null, unit = 'pc') => ({ id, t, w, l, count, price, unit });
  const run = (parts, stock, set = DEFAULT_SETTINGS) => {
    const plan = makePlan(parts, stock, set);
    checkPlan(parts, stock, set, plan);
    return plan;
  };
  // compact view: [stockId, [name, x, y]...] per slab, [name, reason] per unplaced part
  const brief = plan => ({
    slabs: plan.slabs.map(sl => [sl.stockId, ...sl.parts.map(({ p, x, y }) => [p.name, x, y])]),
    unplaced: plan.unplaced.map(p => [p.name, p.reason])
  });
  const used = 'Matching stock is used up – need more pieces';

  // Golden cases, default settings kerf 4 / +20 L / +5 W. Part 40 × 95 × 480 cuts to 100 × 500.
  const four = [P('A', 40, 95, 480, 4)];

  // exact fit: 2 strips of 100 + kerf = 204 wide, 2 parts of 500 + kerf = 1004 long
  assert.deepEqual(brief(run(four, [S(1, 40, 204, 1004, 1)])), {
    slabs: [[1, ['A', 0, 0], ['A', 504, 0], ['A', 0, 104], ['A', 504, 104]]], unplaced: []
  });

  // one mm short across the width: second strip doesn't fit, only 1 piece → 2 parts left over
  assert.deepEqual(brief(run(four, [S(1, 40, 203, 1004, 1)])), {
    slabs: [[1, ['A', 0, 0], ['A', 504, 0]]], unplaced: [['A', used], ['A', used]]
  });

  // one mm short along the length, unlimited stock: one part per strip → 2 slabs
  assert.deepEqual(brief(run(four, [S(1, 40, 204, 1003)])), {
    slabs: [[1, ['A', 0, 0], ['A', 0, 104]], [1, ['A', 0, 0], ['A', 0, 104]]], unplaced: []
  });

  // zero kerf and allowances: 2 × 2 parts of 100 × 500 fill 200 × 1000 exactly
  assert.deepEqual(brief(run([P('A', 40, 100, 500, 4)], [S(1, 40, 200, 1000, 1)], { kerf: 0, exL: 0, exW: 0 })), {
    slabs: [[1, ['A', 0, 0], ['A', 500, 0], ['A', 0, 100], ['A', 500, 100]]], unplaced: []
  });

  // planing down: thinnest adequate stock (50, not 60) is opened; the 45 part shares it (50 − 45 ≤ 20)
  assert.deepEqual(brief(run([P('B', 45, 95, 480), P('A', 50, 95, 480)], [S(1, 60, 204, 1004), S(2, 50, 204, 1004)])), {
    slabs: [[2, ['A', 0, 0], ['B', 504, 0]]], unplaced: []
  });
  // ...but a 20 part may not share a 50 slab (50 − 20 > 20): it opens its own piece
  assert.deepEqual(brief(run([P('B', 20, 95, 480), P('A', 50, 95, 480)], [S(2, 50, 204, 1004)])), {
    slabs: [[2, ['A', 0, 0]], [2, ['B', 0, 0]]], unplaced: []
  });

  // stock runs out: 2 pieces that each hold one part, 3 parts
  assert.deepEqual(brief(run([P('A', 40, 95, 980, 3)], [S(1, 40, 100, 1000, 2)])), {
    slabs: [[1, ['A', 0, 0]], [1, ['A', 0, 0]]], unplaced: [['A', used]]
  });

  // reasons, in the order makePlan checks them
  const reason = (stock, part = P('A', 40, 95, 480)) => run([part], stock).unplaced[0].reason;
  assert.equal(reason([]), 'No stock entered');
  assert.equal(reason([S(1, 27, 300, 3000)]), 'No stock 40 mm or thicker');
  assert.equal(reason([S(1, 40, 99, 3000)]), 'Thick enough stock is too narrow (needs 100 mm)');
  assert.equal(reason([S(1, 40, 100, 499)]), 'Wide enough stock is too short (needs 500 mm)');

  // the warning example, traced by hand through makePlan
  const warn = run(EXAMPLE_PARTS, EXAMPLE_STOCK_WARNING);
  const tops = 'No stock 100 mm or thicker';
  assert.deepEqual(brief(warn), {
    slabs: [
      [1, ['Leg', 0, 0], ['Leg', 749, 0], ['Leg', 1498, 0], ['Leg', 2247, 0], ['Stretcher_long_front', 0, 139]],
      [2, ['Leg_Vise_Body', 0, 0], ['Stretcher_long_back', 779, 0], ['Stretcher_short', 2003, 0]],
      [2, ['Bankhakenleiste', 0, 0]],
      [3, ['Stretcher_short', 0, 0], ['Stretcher_short', 494, 0], ['Stretcher_short', 988, 0]]
    ],
    unplaced: [['Tischplatte_hinten', tops], ['Tischplatte_vorn', tops]]
  });
  // 90×300×3000 @ €2400/m³ = 194.4, two 50×280×2500 @ €2100/m³ = 73.5 each, one unpriced
  assert.ok(Math.abs(warn.totals.price - 341.4) < 1e-9);
  assert.equal(warn.totals.unpricedSlabs, 1);

  run(EXAMPLE_PARTS, EXAMPLE_STOCK);

  // t, w, l are semantic, not size-ordered: a short wide part (w > l, grain across) cuts to 305 × 220,
  // two fit end to end in one strip; a part thicker than wide (cut 45 × 520) gets two strips side by side
  assert.deepEqual(brief(run([P('W', 40, 300, 200, 2)], [S(1, 40, 310, 500, 1)])), {
    slabs: [[1, ['W', 0, 0], ['W', 224, 0]]], unplaced: []
  });
  assert.deepEqual(brief(run([P('T', 60, 40, 500, 2)], [S(1, 60, 100, 600, 1)])), {
    slabs: [[1, ['T', 0, 0], ['T', 0, 49]]], unplaced: []
  });

  // seeded fuzz
  const mulberry32 = a => () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const N = 500;
  for (let seed = 1; seed <= N; seed++) {
    const r = mulberry32(seed), int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    const T = [20, 27, 40, 45, 50, 52, 80, 100], pick = () => T[int(0, T.length - 1)];
    const parts = Array.from({ length: int(1, 8) }, (_, i) => P('p' + i, pick(), int(20, 300), int(100, 2500), int(1, 5)));
    const stock = Array.from({ length: int(0, 5) }, (_, i) => S(i + 1, pick(), int(80, 400), int(500, 4000), r() < 0.4 ? null : int(0, 4)));
    const set = { kerf: int(0, 6), exL: int(0, 30), exW: int(0, 10) };
    try { run(parts, stock, set); } catch (e) {
      console.error(`fuzz seed ${seed} failed: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`check.js: all golden cases and ${N} fuzz cases passed`);
}

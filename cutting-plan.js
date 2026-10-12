// Stock Cutting — packing logic extracted from the prototype (reference/StockCuttingApp.dc.html).
// Plain ES module, no dependencies. All units mm.
//
// parts: [{ name, t, w, l, n }]           finished sizes from CAD, n = quantity
// stock: [{ id, t, w, l, count, price, unit }]  count null = unlimited; unit 'pc' | 'm3'; price null = none
// settings: { kerf, exL, exW }             defaults 4 / 20 / 5

export const DEFAULT_SETTINGS = { kerf: 4, exL: 20, exW: 5 };
export const PLANE_TOLERANCE = 20; // a part may share an already-opened slab up to this much thicker

export const volume = s => s.t * s.w * s.l; // mm³
export const unitPrice = s => (s.price == null ? null : s.unit === 'pc' ? s.price : s.price * volume(s) / 1e9);

function tryPlace(sl, p, k) {
  // 1) existing strip: narrowest strip that is wide enough and has length left
  const fits = sl.strips.filter(st => st.w >= p.cw && st.used + k + p.cl <= sl.l).sort((a, b) => a.w - b.w);
  if (fits.length) {
    const st = fits[0], x = st.used + k;
    st.used = x + p.cl;
    sl.parts.push({ p, x, y: st.y });
    return true;
  }
  // 2) rip a new strip (width = this part's cut width) next to the previous ones
  const y = sl.strips.length ? sl.usedW + k : 0;
  if (y + p.cw <= sl.w && p.cl <= sl.l) {
    sl.strips.push({ y, w: p.cw, used: p.cl });
    sl.usedW = y + p.cw;
    sl.parts.push({ p, x: 0, y });
    return true;
  }
  return false;
}

export function makePlan(parts, stock, set = DEFAULT_SETTINGS) {
  const k = set.kerf, inst = [];
  let uid = 0;
  parts.forEach(p => {
    for (let i = 0; i < p.n; i++) inst.push({
      uid: 'p' + uid++, name: p.name, copy: p.n > 1 ? `${i + 1}/${p.n}` : '',
      t: p.t, w: p.w, l: p.l, cw: p.w + set.exW, cl: p.l + set.exL
    });
  });
  // thickest, then widest, then longest first
  inst.sort((a, b) => b.t - a.t || b.cw - a.cw || b.cl - a.cl);
  const left = stock.map(s => (s.count == null ? Infinity : s.count));
  const slabs = [], unplaced = [];

  for (const p of inst) {
    const open = slabs.filter(sl => sl.t >= p.t && sl.t - p.t <= PLANE_TOLERANCE).sort((a, b) => a.t - b.t);
    if (open.some(sl => tryPlace(sl, p, k))) continue;

    // open a new slab: thinnest adequate stock, then smallest face area
    const opts = stock.map((s, i) => ({ s, i }))
      .filter(o => left[o.i] > 0 && o.s.t >= p.t && o.s.w >= p.cw && o.s.l >= p.cl)
      .sort((a, b) => a.s.t - b.s.t || a.s.w * a.s.l - b.s.w * b.s.l);

    if (!opts.length) {
      const thick = stock.filter(s => s.t >= p.t);
      let reason;
      if (!stock.length) reason = 'No stock entered';
      else if (!thick.length) reason = `No stock ${p.t} mm or thicker`;
      else if (!thick.some(s => s.w >= p.cw)) reason = `Thick enough stock is too narrow (needs ${p.cw} mm)`;
      else if (!thick.some(s => s.w >= p.cw && s.l >= p.cl)) reason = `Wide enough stock is too short (needs ${p.cl} mm)`;
      else reason = 'Matching stock is used up – need more pieces';
      unplaced.push({ ...p, reason });
      continue;
    }
    const o = opts[0];
    left[o.i]--;
    const sl = { stockId: o.s.id, stockIdx: o.i, t: o.s.t, w: o.s.w, l: o.s.l, price: unitPrice(o.s), strips: [], usedW: 0, parts: [] };
    slabs.push(sl);
    tryPlace(sl, p, k);
  }

  slabs.sort((a, b) => a.stockIdx - b.stockIdx);
  slabs.forEach(sl => sl.parts.sort((a, b) => a.y - b.y || a.x - b.x));

  const slabVol = slabs.reduce((a, sl) => a + volume(sl), 0);
  const partVol = slabs.reduce((a, sl) => a + sl.parts.reduce((b, pp) => b + volume(pp.p), 0), 0);
  const priced = slabs.filter(sl => sl.price != null);
  return {
    slabs, unplaced,
    totals: {
      slabCount: slabs.length,
      volumeM3: slabVol / 1e9,
      wastePct: slabVol ? (1 - partVol / slabVol) * 100 : 0,
      price: priced.length ? priced.reduce((a, sl) => a + sl.price, 0) : null,
      unpricedSlabs: slabs.length - priced.length
    }
  };
}

// Example data used in the prototype
export const EXAMPLE_PARTS = [
  ['Tischplatte_hinten', 100, 255, 2276, 1],
  ['Tischplatte_vorn', 100, 215, 2232, 1],
  ['Bankhakenleiste', 40, 100, 2254, 1],
  ['Leg', 90, 130, 725, 4],
  ['Stretcher_long_front', 80, 110, 1140, 1],
  ['Stretcher_long_back', 45, 110, 1200, 1],
  ['Stretcher_short', 45, 110, 470, 2],
  ['Stretcher_short', 45, 90, 470, 2],
  ['Leg_Vise_Body', 45, 247, 755, 1]
].map(([name, t, w, l, n]) => ({ name, t, w, l, n }));

export const EXAMPLE_STOCK = [
  { id: 1, t: 100, w: 260, l: 2400, count: 2, price: 310, unit: 'pc' },
  { id: 2, t: 90, w: 300, l: 3000, count: 1, price: 2400, unit: 'm3' },
  { id: 3, t: 50, w: 280, l: 2500, count: null, price: 2100, unit: 'm3' }
];

// Warning scenario: no 100 mm stock → both table-top parts are unplaced
export const EXAMPLE_STOCK_WARNING = [
  { id: 1, t: 90, w: 300, l: 3000, count: 1, price: 2400, unit: 'm3' },
  { id: 2, t: 50, w: 280, l: 2500, count: null, price: 2100, unit: 'm3' },
  { id: 3, t: 50, w: 240, l: 1500, count: 3, price: null, unit: 'pc' }
];

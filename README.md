# Handoff: Stock Cutting (mobile PWA)

## Overview
A one-handed mobile web app (iPhone portrait, 390 pt wide) used standing in a sawmill yard to decide which timber slabs to buy for a woodworking project. The part list comes from CAD and is preloaded. The user enters the stock the mill has today, then gets a cutting plan: how many slabs to buy, a shopping list, and a to-scale drawing per slab with the parts placed on it. Light mode, outdoor/bright-light use, millimetres everywhere. UI language: English.

Two screens, switched by a bottom tab bar: **Stock** and **Plan**.

## About the Design Files
The files in `reference/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour; they are not production code to copy. They use an internal component format (`.dc.html`, templating with `{{ }}` holes and a logic class), which needs a runtime that is not included.

The task is to **recreate the design in the target repo**. The brief asks for **plain HTML / CSS / JS with no framework**, installable as a PWA. If the repo already has conventions (build tool, module layout, CSS approach), follow them.

`cutting-plan.js` is the exception: it is the packing algorithm lifted out of the prototype as a dependency-free ES module and can be used directly (or ported).

## Fidelity
**High-fidelity.** Colours, type, spacing, borders and copy are final. Recreate them exactly. The chosen visual direction is called "Steel plate" (option 1c / 2a in `reference/Stock Cutting.dc.html`). Ignore the "blueprint" and "sunlight" themes in the reference file; they were rejected alternatives.

## Design system
Built on the **Industry** design system (Barlow Condensed headings over Barlow, a single steel-blue accent with a 100–900 ramp). `reference/industry-styles.css` is its token sheet. You can link it and use the `var(--color-accent-*)` tokens; the hex values below are the same values. The "Steel plate" direction deliberately departs from the strict Industry rules in two places: cards have a pale tinted fill and a 4 px radius, and there are no corner registration marks.

---

## Global layout
- Viewport: 390 × 844 (iPhone 14/15). Safe area top 47 px (status bar), bottom ~22 px (home indicator). Use `env(safe-area-inset-*)` in production.
- App shell: full-height flex column → **screen** (flex: 1, contains its own scroll area + optional bottom dock) → **tab bar** (flex: none).
- Page horizontal padding: 18 px. Background `#f2f2f3`.
- Base font: Barlow 16 px, colour `#1d1f20`.
- Numbers (dimensions, counts, stats) use **Barlow Condensed 600** with `font-variant-numeric: tabular-nums`.
- Dimension format everywhere: `T × W × L` with ` × ` (U+00D7, spaced). No "mm" suffix on values; units are stated in labels.
- Minimum hit target: 44 px. Most controls are 48–62 px.

### Tab bar
- Background `#eef6ff`, top border 1 px `#d6ebff`, padding-bottom 22 px.
- Two equal buttons, height 54 px: "Stock", "Plan". Barlow Condensed 19 px; active weight 600, colour `#2c455d`, 3 px top bar `#2c455d`; inactive weight 400, colour `#5d5d60`.
- Plan tab badge (20 px circle, white Barlow 700 12 px) after the label:
  - `!` on `#a5432f` when the plan has unplaced parts.
  - `•` on `#597ea3` when the plan is stale (stock or settings changed since the last calculation).

---

## Screen 1 — Stock

### Scroll area (padding 12 px 18 px 22 px, vertical gap 22 px)

**1. Project header** (gap 8 px)
- Kicker "PROJECT": Barlow 500 11 px, letter-spacing .1em, uppercase, `#2c455d`.
- Title "Workbench": Barlow Condensed 600 32 px / 1.05, letter-spacing −.015em.
- Parts summary toggle (button, full width, min-height 48 px, padding 0 14 px, bg `#eef6ff`, border 1 px `#b5d9fd`, radius 4 px). Left: "14 parts · 5 thicknesses" (Barlow 500 17 px). Right: "Show list ▾" / "Hide ▴" (Barlow 500 14 px, `#2c455d`).
- Expanded part list (same card style, padding 4 px 14 px): a 3-column grid `1fr auto 32px`, gap 8. Header row "PART | T × W × L MM | QTY" (Barlow 500 11 px, .08em, uppercase, `#5d5d60`). Rows padding 9 px 0, top border 1 px `#d6ebff`: name (Barlow 400 15 px, wraps anywhere), dims (Barlow Condensed 600 16 px), qty "×4" (right-aligned).
- Summary counts: total quantity of all parts; distinct thicknesses.

**2. Stock at the mill**
- Header row: "Stock at the mill" (Barlow Condensed 600 22 px) + right "3 sizes" (Barlow 400 14 px, `#5d5d60`).
- List, gap 8 px. Each **stock row**:
  - Height ≥ 66 px, padding 10 px 12 px 10 px 14 px, bg `#eef6ff`, border 1 px `#b5d9fd`, radius 4 px. Flex row, gap 12.
  - Left column: dims "100 × 260 × 2400" (Barlow Condensed 600 24 px, the × glyphs weight 400 in `#98989b`), below it a meta line (Barlow 13 px `#5d5d60`): `0.062 m³ · €310 / piece` or `0.225 m³ · €2,400 / m³ · €540 / piece` or `… · no price`.
  - Right: count box, min-width 54, height 46, border 1 px `#94bce3`, radius 4. Value "×2" or "∞" (Barlow Condensed 600 21 px, `#2c455d`) over the caption "AVAIL." (Barlow 500 9 px, .08em).
  - **Being edited**: border colour `#416180`.
  - **Just added / merged**: background flashes to `#b5d9fd` for 1.4 s (transition .4 s).
  - **Swipe left** reveals a "Delete" button (width 100 px, bg `#a5432f`, white Barlow 500 16 px) behind the row. Row follows the finger (clamped 0 to −130 px); on release it snaps open at −88 px if dragged past −44 px, otherwise closed (transform .2 s ease). The Delete button is only visible while the row is offset. Use `touch-action: pan-y` so vertical scrolling still works.
  - **Tap** (no horizontal movement > 8 px): if any row is swiped open, close it; otherwise load the row into the entry dock in edit mode.
- Hint under the list: "Tap an entry to edit · swipe left to delete" (Barlow 13 px `#5d5d60`).

**Empty state** (no stock entries) replaces the list:
- Box: border 1 px **dashed** `#98989b`, radius 4, padding 20 px 16 px, gap 12.
- "No stock entered yet" (Barlow Condensed 600 22 px).
- "Walk the yard and enter each slab size the mill has today using the fields below. The thickness stays filled in for the next board." (Barlow 15 px / 1.45, `#5d5d60`).
- "YOUR PARTS NEED" kicker + chips of the distinct part thicknesses, descending: "100 mm", "90 mm", "80 mm", "45 mm", "40 mm" (padding 6 px 10 px, border 1 px `#94bce3`, radius 4, Barlow Condensed 600 16 px `#2c455d`).
- "↓ Start with the thickness" (Barlow 500 14 px).
- The "N sizes" counter is hidden, the Calculate button is disabled (opacity .45), and the thickness field is empty.

**3. Cutting settings** (collapsible card, same card style)
- Header button, min-height 50: "Cutting settings" (Barlow 500 16 px) + right summary "kerf 4 · +20 L · +5 W ▾" (Barlow 14 px `#5d5d60`).
- Expanded: 3-column grid, gap 8, padding 2 px 14 px 14 px. Each field: label (Barlow 500 11 px uppercase `#5d5d60`): "Saw kerf", "Extra length", "Extra width"; input box height 46, border 1 px `#94bce3`, radius 4, white bg, value Barlow Condensed 600 21 px, suffix "mm" (Barlow 13 px).
- Defaults: kerf 4, extra length 20, extra width 5. Numeric only; empty → 0.

### Entry dock (fixed at the bottom of the screen, above the tab bar)
bg `#eef6ff`, top border 1 px `#b5d9fd`, padding 12 px 18 px, vertical gap 10.

- Title row: "ADD STOCK · MM" or "EDIT STOCK ENTRY" (Barlow 500 12 px, .1em, uppercase, `#2c455d`). In edit mode a "Cancel" text button on the right (Barlow 500 15 px, underline).
- **T / W / L fields**: 3-column grid, gap 8. Each is a `<label>` box 62 px tall, padding 0 10, border 1 px `#b5d9fd`, radius 4, white bg. Caption "THICK" / "WIDTH" / "LENGTH" (Barlow 500 11 px uppercase `#5d5d60`), input Barlow Condensed 600 28 px, placeholder "mm" in `#98989b`, caret `#5980a6`.
  - `inputmode="numeric"` (`pattern="[0-9]*"` for iOS), digits only, max 5 digits.
  - `enterkeyhint`: "next", "next", "done".
  - Focus: border `#416180` + `box-shadow: 0 0 0 2px #416180`; select the field contents on focus.
  - Enter on T → focus W; Enter on W → focus L; Enter on L → submit.
- **Second row** (height 52, gap 8):
  - Count stepper (border 1 px `#94bce3`, radius 4, white): [− 38 px] [value, min 30 px, Barlow Condensed 600 22 px] [+ 38 px] [∞ 42 px]. − floors at 1. ∞ toggles unlimited (filled `#2c455d`, white glyph when active); − or + while unlimited → 1. Default 1.
  - Price field (flex 1): "€" prefix, decimal input (placeholder "0", digits and `.`/`,`, max 7 characters), and a unit toggle on the right "/ pc" ↔ "/ m³" (Barlow 500 14 px `#2c455d`). Optional.
  - Add/Save button: width 76, bg `#d6ebff`, border 1 px `#94bce3`, colour `#1d2d3d`, Barlow Condensed 600 19 px. Label "Add" or "Save" in edit mode. Disabled (opacity .45) until T, W and L are all > 0.
- **Primary CTA** "Calculate cutting plan": height 56, full width, bg `#2c455d`, white, Barlow Condensed 600 21 px, radius 4. Disabled (opacity .45) when there is no stock. On tap: calculate, then switch to the Plan tab.

**Submit behaviour**
- New entry: append to the end of the list, scroll the list to the bottom, flash the row, then **keep T**, clear W, L and price, reset count to 1, keep the price unit, and focus W. This is the key fast-entry loop for several boards of one thickness.
- If an entry with identical T × W × L already exists: merge instead of adding. Counts are summed (unlimited wins); a newly entered price replaces the old one. Flash the existing row.
- Edit mode: replace the entry in place, flash it, leave edit mode.
- Delete: remove the entry; if it was being edited, leave edit mode.

---

## Screen 2 — Plan

### No plan yet
Centred column, padding 24: "No plan yet" (Barlow Condensed 600 28 px), "Enter the stock the mill has on the Stock tab, then calculate." (Barlow 16 px `#5d5d60`), "Go to Stock" button (height 52, card style).

### Scroll area (padding 14 px 18 px 22 px, gap 18)

**Stale banner** (only when stock or settings changed after the last calculation): border 1 px `#597ea3`, bg `#d6ebff`, radius 4, padding 10 px 10 px 10 px 14 px. Text "Stock or settings changed since this plan was made." (Barlow 14 px) + "Recalculate" button (height 44, bg `#2c455d`, white, Barlow Condensed 600 17 px).

**Summary** (very prominent): bg `#416180`, white text, radius 4, padding 16 px 16 px 14 px.
- Kicker "WORKBENCH · CUTTING PLAN" (Barlow 500 11 px, .1em, `#d6ebff`).
- "Buy 5 slabs" (singular "slab" for 1): Barlow Condensed 600 52 px / .95, letter-spacing −.02em.
- Stats row, top border 1 px `#749dc4`, padding-top 12, equal columns (grid auto-flow column): label (Barlow 500 11 px uppercase `#d6ebff`) over value (Barlow Condensed 600 24 px):
  - VOLUME "0.360 m³" (3 decimals)
  - WASTE "41 %": 1 − (finished part volume ÷ bought slab volume)
  - TOTAL "€842": only shown if at least one slab has a price
- If some slabs are priced and some are not: "Total excludes N slab(s) without a price" (Barlow 13 px `#d6ebff`).

**Warning block** (only if parts could not be placed): border 1.5 px `#a5432f`, bg `#fbeeea`, radius 4, padding 14, gap 10.
- 26 px circle `#a5432f` with white "!" + title "2 parts can't be cut from the stock entered" (Barlow Condensed 600 21 px `#7a2c1e`).
- "Ask the mill for stock at least this size (T × W × L, allowances included):" (Barlow 14 px `#7a2c1e`).
- One row per distinct unplaced part (grouped by name + size), top border 1 px `#efcdc4`: name + "×1" on one line; required size "≥ 100 × 260 × 2296" (Barlow Condensed 600 22 px `#7a2c1e`); reason (Barlow 13 px `#5d5d60`). Possible reasons:
  - "No stock entered"
  - "No stock 100 mm or thicker"
  - "Thick enough stock is too narrow (needs 260 mm)"
  - "Wide enough stock is too short (needs 2296 mm)"
  - "Matching stock is used up – need more pieces"

**Shopping list** (card): kicker "SHOPPING LIST"; rows (padding 11 px 0, top border 1 px `#d6ebff`): count "2 ×" (Barlow Condensed 600 26 px `#2c455d`, min-width 38), dims "100 × 260 × 2400" (Barlow Condensed 600 24 px), right line price "€620" or "no price" (Barlow 15 px `#5d5d60`). One row per stock entry used, in stock-list order.

**Section header** "Slabs" (Barlow Condensed 600 22 px) + right "Tap a part to identify it" (Barlow 14 px `#5d5d60`).

**Slab card** (one per slab to buy; card style, padding 12 px 12 px 4 px, gap 10):
- Header: number badge (30 × 30, bg `#2c455d`, white Barlow Condensed 600 18 px), dims (Barlow Condensed 600 23 px), meta "0.062 m³ · 12% waste · €310" (Barlow 13 px `#5d5d60`), right progress pill "2/4 cut" (Barlow Condensed 600 16 px, padding 6 px 8 px; bg `#d6ebff` / text `#2c455d`; when all parts are ticked, bg `#2c455d` / white).
- **Drawing** (to scale): a container with `aspect-ratio: L / W` at 100% card width, inside a horizontal-scroll wrapper. Length runs left to right, width top to bottom.
  - Slab background = offcut/waste hatch: `repeating-linear-gradient(135deg, #94bce3 0 1px, #eef6ff 1px 6px)`, outline `0 0 0 1.5px #2c455d`.
  - Each part is an absolutely positioned rectangle: `left = x/L`, `top = y/W`, `width = cutLength/L`, `height = cutWidth/W` (percent). Fill `#ffffff`, inset 1 px outline `#416180`. Kerf gaps between parts show the hatch through. Centred label = part number (Barlow Condensed 600 12 px); when zoomed, "3  Leg".
  - States: selected fill `#2c455d` with white label; ticked fill `#d6ebff` with label `#98989b`.
  - **Zoom** button (height 40, white, border 1 px `#94bce3`) toggles the drawing width between 100% and 340% (scroll sideways). Label "Zoom" / "Fit". At fit width the kerf is sub-pixel; zoom makes it visible.
- Info line (min-height 44) left of the Zoom button: "Tap a part in the drawing" (Barlow 14 px `#5d5d60`), or when a part on this slab is selected: "3 · Leg 2/4 — 90 × 130 × 725 · at 1,498 along, 139 across" (Barlow 500 14 px), giving the offset of the part's corner from the slab's top-left corner in mm.
- **Part list**: rows min-height 52, top border 1 px `#d6ebff`.
  - Checkbox button 48 × 52 containing a 26 px box (border 1.5 px `#416180`, radius 3, white; checked: fill `#2c455d` with white "✓").
  - Tap area (rest of row) selects the part: number (Barlow Condensed 600 15 px `#2c455d`), name with copy index ("Leg 2/4"; Barlow 500 16 px); second line "90 × 130 × 725 · cut 135 × 745" plus " · plane 100→90" when the slab is thicker than the part (Barlow 13 px `#5d5d60`).
  - Selected row bg `#d6ebff`. Checked: name `#98989b` with line-through.
- Parts are numbered 1…n per slab, sorted by strip (y) then position along the strip (x).

**Bottom dock**: "‹ Adjust stock" (height 52, full width, white, border 1 px `#94bce3`, Barlow Condensed 600 20 px), switches to the Stock tab.

---

## Interactions summary
- Tapping a part (drawing or list) toggles the selection; only one part is selected app-wide.
- Checkboxes persist per part instance. Recalculating resets the ticks, selection and zoom. *(Production: persist ticks in `localStorage` keyed by plan, since cutting happens later at home.)*
- Any change to stock or settings increments a version; if it differs from the plan's version, the plan is stale (banner + tab badge).
- Transitions: swipe snap `transform .2s ease`; row flash `background .4s`. Nothing else animates.
- Focus-visible: `outline: 2px solid #5980a6; outline-offset: 2px`.

## State
```
tab: 'stock' | 'plan'
parts: Part[]                         // from CAD, read-only
stock: { id, t, w, l, count|null, price|null, unit:'pc'|'m3' }[]
settings: { kerf, exL, exW }
form: { t, w, l, count|null, price, unit }   // t persists between adds
editId, swipe {id, dx}, openId, flashId, focusField
plan: makePlan(...) result | null; planVersion; version
selectedPartUid, zoom{slabIndex:bool}, done{partUid:bool}
partsOpen, settingsOpen
```
Production: persist `stock`, `settings`, `plan` and `done` in `localStorage` (offline yard use). Add a service worker + manifest for PWA install.

## Cutting algorithm (`cutting-plan.js`)
- Cut size per part = finished + extra (W + 5, L + 20 by default).
- Parts are sorted by thickness, width, then length (all descending) and placed greedily.
- A slab is ripped lengthwise into **strips** side by side (kerf between strips); each strip is crosscut into parts end to end (kerf between parts). A strip's width = the first part placed in it; later parts go into the narrowest strip that fits.
- Thickness: a part needs stock **≥** its thickness (planed down). It may join an already-opened slab that is at most 20 mm thicker; otherwise a new slab is opened from the thinnest adequate stock with the smallest face area that still has pieces available.
- This is a heuristic, not optimal. Swap it out if you want better yield; keep the output shape (`slabs[].parts[{p,x,y}]`, `unplaced[]` with `reason`).

## Design tokens (Steel plate)
| Role | Hex |
|---|---|
| Ground | `#f2f2f3` |
| Ink | `#1d1f20` |
| Muted text | `#5d5d60` |
| Faint / disabled text | `#98989b` |
| Card fill / dock / tab bar | `#eef6ff` (accent-100) |
| Rule / soft border | `#d6ebff` (accent-200) |
| Card border | `#b5d9fd` (accent-300) |
| Input border | `#94bce3` (accent-400) |
| Accent base | `#597ea3` |
| Accent strong (summary field, focus) | `#416180` (accent-700) |
| Accent text / CTA / badges | `#2c455d` (accent-800) |
| Accent darkest | `#1d2d3d` (accent-900) |
| Warning (only non-system colour) | `#a5432f`, text `#7a2c1e`, bg `#fbeeea`, rule `#efcdc4` |

- Fonts: Barlow 400/500/700, Barlow Condensed 400/600 (Google Fonts).
- Radius: 4 px for cards, inputs and buttons; 3 px for checkboxes; tab badges are circles.
- Borders: 1 px (warning block 1.5 px). No shadows inside the app.
- Spacing used: 4, 6, 8, 10, 12, 14, 16, 18, 22 px.

## Assets
No images or icons. Glyphs used: ×, ∞, −, +, ✓, ‹, ▾/▴, ↓, ! (all plain text).

## Files
- `cutting-plan.js`: packing logic plus example data (`EXAMPLE_PARTS`, `EXAMPLE_STOCK`, `EXAMPLE_STOCK_WARNING`). Usable as is.
- `reference/StockCuttingApp.dc.html`: the full interactive prototype (template + logic). Theme values are in `THEMES.plate`.
- `reference/Stock Cutting.dc.html`: the presentation board with all four states (filled, empty, plan, warning) and the rejected directions.
- `reference/industry-styles.css`: Industry design-system tokens.

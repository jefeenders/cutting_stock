# Stock Cutting

A phone web app for buying timber at a sawmill. It takes a part list (BOM) from an Onshape design and,
from the stock the mill actually has that day, works out how many slabs/boards to buy and how to cut
each one.

## Workflow

1. **At home, in Onshape:** design the piece. Export the BOM (parts with name, quantity, thickness,
   width, length, material).
2. **Convert the BOM:** turn the Onshape export into `parts.json` (or CSV) and commit it to this repo,
   or load it in the app.
3. **At the sawmill, on the iPhone:** open the app (GitHub Pages, added to the home screen as an icon).
   Enter what the mill has: thickness × width × length (and how many) for each kind of stock.
4. **The app computes a cutting plan:** which parts come from which slab, how many slabs to buy, and how
   much is wasted. It shows a simple drawing of the cuts on each slab.
5. Buy the slabs and cut at home following the plan.

## Architecture

- A static site, served from GitHub Pages. No backend, no build step: plain HTML + CSS + JS.
- PWA basics (`manifest.json`, icon, `apple-mobile-web-app-capable`) so it opens full-screen from the
  home screen. It should also work offline at the mill (service worker), since reception may be poor.
- Stock entered at the mill is saved in `localStorage` so a reload doesn't lose it.
- BOM conversion from Onshape happens outside the app (script or manual export). The app only reads the
  part list.

## Cutting problem

- Parts and stock are 3D boxes, but thickness must match (or the board is planed down). In practice it
  is a 2D problem (width × length) per thickness group.
- Kerf (saw blade width) and trim allowance (oversize on each part for planing/squaring) are settings.
- Grain direction: a part's length runs along the board's length (no rotation) unless the part is marked
  as rotatable.
- Goal: the fewest slabs (or lowest cost/volume) that hold every part. Use a simple heuristic
  (first-fit decreasing, guillotine cuts), not an exact solver. Guillotine cuts match how a table saw
  or circular saw is really used.

## Conventions

- Units: millimetres everywhere.
- Keep it small: few files, no frameworks, no dependencies unless they clearly earn their place.
- Core packing logic lives in one plain JS module with an assert-based self-check runnable in Node.

## Onshape access (tested 2026-10-12)

- REST API with keys in `.env` (`ONSHAPE_ACCESS_KEY`, `ONSHAPE_SECRET_KEY`, basic auth). Never commit `.env`.
- Assembly BOM: `GET /api/v10/assemblies/d/{did}/w/{wid}/e/{eid}/bom` returns names and quantities only,
  no dimensions.
- Dimensions: `GET /api/v10/parts/d/{did}/w/{wid}/e/{eid}/partid/{pid}/boundingboxes` on the Part Studio,
  sorted smallest to largest = thickness × width × length. The box is axis-aligned, so a part modelled
  at an angle reports wrong sizes.
- Material is not set on the parts yet, so wood vs. hardware / 3D print can't be told apart automatically.

## Open questions

Answers go here as they come in; update the sections above to match.

1. **BOM export:** manual CSV/Excel from Onshape's BOM table, or automatic through the Onshape API? Any
   custom properties (material, grain)?
2. **Stock type:** rough-sawn slabs with a live (bark) edge, or square-edged boards? (Live edge = less
   usable width.)
3. **Thickness:** a fixed set of standard thicknesses (e.g. 27/40/52 mm)? Is thicker stock planed down,
   or sometimes resawn?
4. **Allowances:** saw kerf? How much extra length and width per part for planing and squaring?
5. **Grain:** does part length always run along the board? Which parts can be rotated, or glued up from
   narrower strips?
6. **Optimal:** fewest slabs, least waste, or lowest price? Priced per m³ or per board?
7. **Quantity:** a limited count per stock size, or effectively unlimited?
8. **Projects:** one part list at a time, or several saved projects?
9. **Language:** German or English UI?


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

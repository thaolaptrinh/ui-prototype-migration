# Visual Verification

> A migration is not complete because it compiles or tests pass. It is complete
> when the **rendered pixels and interactions match the prototype**, proven with
> browser evidence — not a "looks good."

## Table of contents
1. [Why this is mandatory](#why-this-is-mandatory)
2. [The verify loop](#the-verify-loop)
3. [Two kinds of evidence](#two-kinds-of-evidence)
4. [Pixel diff — the alarm](#pixel-diff--the-alarm)
5. [Computed-style & bounding-box diff — the diagnosis](#computed-style--bounding-box-diff--the-diagnosis)
6. [Viewports and responsive checks](#viewports-and-responsive-checks)
7. [Interaction & state checks](#interaction--state-checks)
8. [Assets and typography checks](#assets-and-typography-checks)
9. [Using the bundled compare script](#using-the-bundled-compare-script)
10. [Reporting — evidence, not adjectives](#reporting--evidence-not-adjectives)
11. [What "done" means](#what-done-means)

---

## Why this is mandatory

Compiling, type-checking, lint passing, unit tests passing, and the page loading
prove **nothing** about visual fidelity. A `padding` snapped from `18px` to
`16px`, a dropped `@media` query, or a swapped icon all compile cleanly and look
*almost* right. Only comparing the **actual render** of prototype vs. target
catches them.

Visual parity is an **acceptance criterion**, not a polish step.

## The verify loop

```
IMPLEMENT  →  RUN both prototype & target  →  CAPTURE evidence at every viewport
   →  COMPARE  →  list concrete differences  →  FIX  →  VERIFY AGAIN
```

Repeat until the acceptance list (see [What "done" means](#what-done-means)) is
met. Do **not** refactor architecture until this loop converges.

## Two kinds of evidence

Combine both — they catch different things:

| Evidence | Catches | Limitation |
| --- | --- | --- |
| **Pixel diff** (screenshot comparison) | Any visible drift at all | Doesn't say *why*; flaky across OS/font rendering |
| **Computed-style + bounding-box diff** | Exactly which CSS value/geometry differs | Only checks selectors you name |

Use pixel diff as the **alarm** ("something drifted") and computed-style diff
as the **diagnosis** ("the `border-radius` is `12px` vs `14px`").

## Pixel diff — the alarm

Capture full-page (and key-region) screenshots of **both** prototype and target
at identical viewports, then diff.

- Match the viewport exactly (same width/height/device-scale).
- Neutralize dynamic content (dates, avatars) with masks or stable fixtures.
- Treat the diff as a signal to investigate, not a pass/fail number.
- Anti-aliasing/font-rendering differences across machines cause false positives;
  don't chase sub-pixel noise that is purely environmental.

## Pixel diff done right (baseline, thresholds, flake hygiene)

The bundled `compare-visuals.mjs` does a naive one-shot diff — fine for ad-hoc
diagnosis. For a trustworthy, repeatable pipeline prefer Playwright
`expect(page).toHaveScreenshot()`, which adds **baseline management** and
**flake stabilization**. Principles to follow regardless of tool:

**Baseline-first, verify-second.** First run creates the baseline (Playwright
auto-retries until two consecutive shots match). A first run is **not** a pass —
run again to actually verify. Commit baselines in git next to the code; update
them via `--update-snapshots` inside the same change that altered the UI, with
the PNG diff reviewed. `--update-snapshots` accepts *every* diff — never run it
blindly to make a failure disappear.

**Thresholds have three knobs with different meanings** — don't conflate them:

| Knob | Use for |
| --- | --- |
| `threshold` (default `0.2`, per-pixel color) | absorb **rendering noise** only (anti-aliasing, sub-pixel). |
| `maxDiffPixelRatio` (fraction of pixels) | cap total **affected area**. |
| `maxDiffPixels` (absolute count) | same, as a count. |

Anti-pattern: **hiding a real regression by raising a threshold.** If the diff
fails, investigate the cause first. Sensible migration starting point:
`maxDiffPixelRatio: 0.001`, `threshold: 0.1`.

**Flake hygiene before capturing** (the dark-mode font-load race we hit is the
canonical example):

- Fixed `viewport` + `deviceScaleFactor: 1` in config (deterministic image size).
- `await page.evaluate(() => document.fonts.ready)` — **do not** assume the
  framework auto-waits for fonts (only "two consecutive identical shots" is
  documented; explicit await is the safe, verified approach).
- Inject CSS to hide scrollbars (`stylePath`: `::-webkit-scrollbar{display:none}`
  `*{scrollbar-width:none}`) — not handled automatically and varies by OS.
- Rely on the defaults `animations: 'disabled'` and `caret: 'hide'`; set
  `reducedMotion: 'reduce'` in config.
- Neutralize dynamic content: `mask` the region (keeps layout, excludes from
  diff) for timestamps/avatars; mock via `page.route` for random data. Mark
  dynamic regions `[data-dynamic]` so a single locator masks them all.

**Single-OS for determinism.** Font/AA/emoji rendering differs by OS — a macOS
baseline never matches Linux. Run the VRT project on one OS only (Linux CI, or
the `mcr.microsoft.com/playwright` Docker image). If developers are on macOS,
regenerate baselines *in CI* rather than committing local ones.

**Ignore vs remove for dynamic regions** (borrowed from BackstopJS): `mask` =
`visibility:hidden` (keeps the box, stable layout) — default; only "remove" a
region from the DOM when its size is unpredictable.

If an automated pixel comparison is available (Playwright `toHaveScreenshot`,
or the bundled `scripts/compare-visuals.mjs`), use it. If not, do structured
screenshot comparison manually. **Never invent a visual-diff score.**

## Computed-style & bounding-box diff — the diagnosis

For a curated set of selectors present in **both** pages, compare resolved values:

- **geometry:** `boundingBox()` → x, y, width, height; also `width`/`height`
  from `getComputedStyle`.
- **box model:** `padding`, `margin`, `border` (width/style/color), `border-radius`, `gap`.
- **typography:** `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `color`.
- **decoration:** `background-color`/`background`, `box-shadow`, `opacity`.
- **layout:** `display`, `position`, `flex-direction`, `align-items`, `justify-content`.

Implementation notes (Playwright):

- `await locator.boundingBox()` gives geometry.
- `await expect(locator).toHaveCSS('border-radius', '14px')` asserts a resolved value.
- For **CSS custom properties** and pseudo-elements, `toHaveCSS` is unreliable —
  use `page.evaluate(() => getComputedStyle(el).getPropertyValue('--x'))`.
- Compare the **resolved** value, not the authored token, because that's what
  the user sees.

A single `border-radius: 12px (target) vs 14px (prototype)` finding is more
actionable than a red pixel-diff blob.

## Viewports and responsive checks

Test at the prototype's **own** breakpoints, not Tailwind's defaults:

- For each `@media` in the prototype, pick a viewport just inside that breakpoint.
- Verify: which elements show/hide, stacking order, sidebar collapse, font-size
  changes, grid column counts.
- The prototype's breakpoints are the contract. Do not "round" `760px` to `768px`.

Typical viewport set (adapt to the prototype): desktop (e.g. 1280), just-above
and just-below each breakpoint, and a phone width (e.g. 375).

## Interaction & state checks

Screenshots of the resting state miss most behavior. Capture/verify each state
the prototype defines:

- hover, focus-visible, active, disabled,
- expanded/collapsed (sidebar, accordion),
- open/closed (dropdown, modal, menu),
- selected (tab, nav item),
- loading/empty (if present),
- responsive interactions (hamburger toggling the sidebar).

Drive these with Playwright (`hover()`, `click()`, `focus()`, keyboard) and
re-screenshot / re-check computed styles in each state.

## Accessibility: no *new* violations vs the prototype

Visual parity is not the whole contract — a migration must not **regress
accessibility**. The goal is *"the target has no axe violation the prototype
didn't already have"*, not "perfect WCAG" (the prototype may carry pre-existing
debt that is out of migration scope).

Run the same axe scan on **both** prototype and target, in the same view/state,
and diff the violation sets. With `@axe-core/playwright`:

```ts
import AxeBuilder from "@axe-core/playwright";
const scan = (page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
const proto = await scan(protoPage);
const target = await scan(targetPage);
// normalize: Map<ruleId, Set<cssTarget>> ; assert target ⊆ prototype
```

Rules:

- Compare by **rule id + target selector** (not raw node count), so a list with
  N identical items counts as one issue, not N.
- **Fail** only on *new* `critical`/`serious` violations; *new*
  `moderate`/`minor` and axe `incomplete` (needs-manual-review) are warnings,
  not blockers.
- A violation the **prototype already had** (e.g. a contrast issue in the source
  design) is **inherited debt** — record it in an allowlist
  (`disableRules`/`exclude`) with a comment, and **do not fix it silently** in
  migration scope (that would be a redesign). Surface it to the user instead.
- `analyze()` scans the state **at call time** — drive to the desired view/state
  (modal open, dropdown open) before scanning, exactly as for screenshots.
- Attach the full JSON result as an artifact when it fails, for debugging.

## Compare each view, not just one URL

A prototype is often one file with every "page" in the DOM (hidden via display),
while the migrated target is a **route-mounted SPA** that only renders the
current view's components. Comparing a single URL then produces a flood of false
"missing on target" hits for selectors that belong to *other* views (a table on
the Users view, a form on Settings, the login screen) — they're in the
prototype's DOM (hidden) but not mounted in the target's current route.

Compare **per view**:

1. Navigate both prototype and target to the same route (`#/dashboard`,
   `#/users`, …) before capturing.
2. For each view, compare only the selectors that view actually renders. Ignore
   selectors belonging to other views on that capture.
3. Repeat for every view + the login/auth gate + each theme (light/dark) + each
   interaction state.

`scripts/compare-visuals.mjs` compares one URL pair at a time — run it once per
(view × theme) by passing the route hash in the URL
(`--prototype http://…/#/users`), with a selector list scoped to that view.

## Re-verify after every CSS redistribution

Co-locating CSS into `<style scoped>` is a **real change to resolved styles** —
Vue's scope attribute shifts specificity and silently breaks rules on slotted
content (see
[framework/vue.md §Specificity caveats](framework/vue.md#specificity-caveats-with-style-scoped)).
Treat the co-location step as requiring a **fresh full visual-diff**, not a
cosmetic refactor. The most common regression — a slotted icon collapsing to 0
width because `.btn svg` no longer matches — is invisible in a build/smoke check
and only shows up in computed-style diff. After moving any rule into a scoped
block, re-run the comparison before claiming parity.

## Assets and typography checks

- Icons/SVGs: same paths, same `viewBox`, same `stroke-width`/`fill`.
- Images/logos: same files (or byte-equivalent), same intrinsic + rendered size.
- Fonts: same family + the **exact weights** the prototype loads; same fallback
  stack; same `font-display`. A missing weight silently falls back and shifts
  metrics.
- Verify webfonts actually load in the target (network tab / computed
  `font-family` resolving to the intended face).

## Using the bundled compare script

`scripts/compare-visuals.mjs` automates the diagnosis half: it loads a prototype
URL and a target URL at multiple viewports, screenshots both, and diffs
`boundingBox` + key computed styles for a list of selectors you provide.

```bash
# both apps must be running first, e.g.:
#   python3 -m http.server 5173 --directory examples/fixtures/prototype-dashboard
#   (target dev server on its own port)
node scripts/compare-visuals.mjs \
  --prototype http://localhost:5173 \
  --target    http://localhost:3000 \
  --selectors selectors.json \
  --viewports 1280,760,375
```

`selectors.json` is a list of selectors that should exist on **both** pages:

```json
[".stat-card", ".btn--primary", ".sidebar", ".avatar", ".search", ".panel"]
```

Run `node scripts/compare-visuals.mjs --help` for all options. The script writes
a JSON report and prints a human-readable diff. Use its output as evidence in
your completion report.

The script is an aid, not a gate: if Playwright is unavailable in the
environment, fall back to manual structured inspection using the same
selector/style list. For a **repeatable, CI-grade** pipeline, prefer Playwright
`expect(...).toHaveScreenshot()` with committed baselines over this one-shot
script — see [Pixel diff done right](#pixel-diff-done-right-baseline-thresholds-flake-hygiene)
and [Accessibility: no new violations](#accessibility-no-new-violations-vs-the-prototype).

**Scope note:** `compare-visuals.mjs` compares the **resting** state only. It
does not drive interactions. To verify hover/focus/open/selected states, write
small Playwright snippets that perform the action (`.click()`, `.hover()`,
keyboard) and then re-run the same `getComputedStyle` / `boundingBox` checks or
re-screenshot — see [Interaction & state checks](#interaction--state-checks).

## Reporting — evidence, not adjectives

When you report status, attach evidence, not adjectives.

- ❌ "Looks good." / "Matches the prototype." / "Pixel-perfect."
- ✅ "Compared 18 selectors at 3 viewports; 2 differences remain:
  `.stat-card` border-radius `12px` vs `14px` (fixed), `.search` width `300px`
  vs `320px` (fixed). Screenshots: <paths>. Full report: <path>."

Cite screenshots and the style-diff report. If something could not be verified
automated, say how you verified it manually and what could not be checked.

## What "done" means

**A clean build, passing tests, and "it renders without errors" are NOT done.**
Those prove nothing about fidelity (a 0-width slotted icon, a dropped `@media`,
a missing id all build and render fine). Done requires a **passing visual-diff**
as evidence:

1. `compare-visuals.mjs` (or an equivalent computed-style + bounding-box diff)
   reports **0 real differences** — run per view × theme × viewport, not once.
   A non-zero exit means keep iterating; do not declare done.
2. Screenshots of prototype vs. target match at every tested viewport.
3. Responsive behavior matches the prototype's breakpoints.
4. All interactive states match (hover/focus/open/selected/…).
5. Assets and typography render identically.
6. No **new** accessibility violations vs the prototype (axe: target ⊆ prototype
   on critical/serious), with inherited debt documented rather than silently
   "fixed".
7. Component structure is acceptable and the render is still identical.

"Differences" that are purely methodological (a selector belonging to another
view being absent because the SPA route-mounts it) are not real diffs — but
every **computed-value** or **geometry** difference IS real and must be fixed
or explicitly justified before proceeding.

Only **then** proceed to optional refactoring. If you cannot fully verify
(e.g. no browser available), state that explicitly as a limitation — do not
claim parity you did not prove.

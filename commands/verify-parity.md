---
description: Verify visual parity (prototype vs migrated target) per view × theme × viewport — the "done" gate
argument-hint: --prototype <url> --target <url> [--selectors <file>] [--viewports 1440,1024,768]
allowed-tools:
  - Bash
  - Read
  - Write
---

Verify that the migrated target reproduces the prototype's render, the way the
skill's Phase 4 demands. Treat
[`skills/ui-prototype-migration/references/visual-verification.md`](../skills/ui-prototype-migration/references/visual-verification.md)
as the source of truth.

Full argument string: `$ARGUMENTS`

## Flags

- `--prototype <url>` — running URL of the ORIGINAL prototype (source of truth). Required.
- `--target <url>` — running URL of the MIGRATED app. Required.
- `--selectors <file>` — JSON array of selectors that should match on both pages (default: derive from the prototype, or use `examples/fixtures/prototype-dashboard/selectors.example.json`).
- `--viewports 1440,1024,768` — viewport widths in px (use the prototype's own breakpoints).

Both apps must already be running.

## Required behaviour

1. Run `node scripts/verify-parity.mjs` with the given flags — the **unified Phase-4 gate**: computed-style + bbox diff per selector × viewport, full-page screenshots (alarm), optional axe a11y (no new violations), with flake hygiene (`fonts.ready`, `deviceScaleFactor:1`, `reducedMotion`) and an exit code. (The older `scripts/compare-visuals.mjs` is the resting-state subset; prefer `verify-parity.mjs`.)
2. For an SPA target, compare **per view** by passing the route hash in each URL (`--prototype http://…/#/users`) and a selector list scoped to that view. Ignore selectors that belong to other views on a given capture (methodological, not a real diff).
3. Flake hygiene before trusting pixels: `document.fonts.ready`, fixed viewport + `deviceScaleFactor:1`, `reducedMotion`. Prefer single-OS.
4. Every **computed-value/geometry** difference is REAL — list it, fix it, re-run. Pixel-only noise from anti-aliasing/fonts is environmental; investigate before dismissing.
5. Optional a11y: run axe-core on both and assert the target adds **no new** critical/serious violations vs the prototype (inherited debt is documented, not silently "fixed").
6. Report with evidence — per view × theme × viewport diff counts and the concrete findings. Exit non-zero if any real difference remains: **a clean build is not done; a passing diff is.**

This command **reports once; it does not auto-fix**. The caller iterates: run → analyze the diffs → fix in the target → re-run. A non-zero exit means "not done yet; keep iterating" (see SKILL.md Phase 5).

`compare-visuals.mjs` is an aid, not a gate by itself — for CI-grade use prefer Playwright `toHaveScreenshot()` with committed baselines (see visual-verification.md §"Pixel diff done right").

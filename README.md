# ui-prototype-migration

**Migrate an existing HTML/CSS prototype into Vue components — pixel-for-pixel. It preserves a finished design; it doesn't generate or "improve" one.**

Agents migrating UI prototypes keep making the same moves: snap `padding: 18px` to `p-4`, swap in a UI library "because it looks similar", or ship "looks good" without ever opening a browser. The result compiles and drifts. This skill makes the prototype the **visual + behavioral source of truth** and a **passing visual diff** the acceptance gate — not a clean build.

## Quickstart

**Claude Code:**

```bash
/plugin marketplace add thaolaptrinh/ui-prototype-migration
/plugin install ui-prototype-migration@ui-prototype-migration
```

**Codex:**

```bash
codex plugin marketplace add thaolaptrinh/ui-prototype-migration
codex plugin add ui-prototype-migration@ui-prototype-migration
```

Then just ask — the skill auto-activates:

```
Migrate examples/fixtures/prototype-dashboard into a Vue 3 app and prove it matches.
```

Or use the commands directly: `/migrate-prototype <path>`, then `/verify-parity` as the gate.

## Workflow

`Inspect → Inventory → Port 1:1 → Verify (diff) → Iterate to 0 diffs → Refactor (after parity)`

- **Port 1:1** — templates + the prototype's CSS **verbatim** (exact values; no Tailwind/utility snapping; ids/classes kept).
- **Co-locate** styles per component (`<style scoped>`); global only tokens + base + shell + shared atoms. Slotted content needs `:deep()`; no extra wrapper elements.
- **Verify = diff, not build** — per **view × theme × viewport**, every interactive state: pixel diff (alarm) + computed-style/bbox diff (diagnosis) + axe a11y (no new violations). **Done = 0 real differences, with evidence.**

Full method: [`SKILL.md`](skills/ui-prototype-migration/SKILL.md) + [`references/`](skills/ui-prototype-migration/references/).

## It's working if…

- The migrated app renders **identically** to the prototype at every viewport and theme — same spacing, radii, colors, fonts, shadows (proven by a diff, not an eyeball).
- Hover/focus/open/selected/loading states all match; responsive breakpoints behave the same.
- CSS values were carried **verbatim** (no utility snapping); component styles are co-located, not dumped in one global file.
- You can show per-view×theme×viewport diff evidence — or honestly state what you couldn't verify and why.

## When not to use

Designing new UI from a spec/screenshot, Figma-to-code, or "make this UI better". This skill preserves an existing design — pointing it at something unfinished is the wrong tool.

## Commands

- **`/migrate-prototype <prototype-path> [--target <dir>]`** — runs the phased migration workflow.
- **`/verify-parity --prototype <url> --target <url>`** — the "done" gate (reports once; you iterate until it exits 0).

## Contents

- [`skills/ui-prototype-migration/`](skills/ui-prototype-migration/) — `SKILL.md` + `references/` (css-preservation, componentization, visual-verification, framework/vue).
- [`commands/`](commands/) — `migrate-prototype.md`, `verify-parity.md` (logic lives in the skill).
- [`scripts/`](scripts/) — `verify-parity.mjs` (unified Phase-4 gate: computed-style + bbox + pixel + axe, per view × theme × viewport) and `compare-visuals.mjs` (legacy resting-state subset).
- [`examples/fixtures/`](examples/fixtures/) — sample prototypes to practice on (admin dashboard, marketing landing, multi-page).
- `.claude-plugin/` + `.codex-plugin/` — plugin manifests for Claude Code and Codex.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — validation gates, version discipline, PR conventions.

## Troubleshooting (known traps)

- **Slotted icon collapses to 0px.** A `<style scoped>` rule like `.btn svg` does not match an SVG passed through `<slot>` (it gets the parent's scope attr). Use `.btn :deep(svg)`. Symptom: a button ~16px narrower than the prototype.
- **Responsive rules lose to scoped specificity.** A scoped base rule (`0,2,0`) can beat a global `@media` rule (`0,1,0`), so the layout doesn't collapse at the breakpoint. Co-locate the component's own `@media` inside its scoped block, or verify at the breakpoint.
- **axe reports a "new" violation that isn't.** Vue scoped attributes (`[data-v-xxx]`) appear in axe node selectors, so target keys never match prototype keys. `verify-parity.mjs` strips them; if writing your own diff, normalize both sides.
- **Geometry diff from smooth-scroll timing.** With `html{scroll-behavior:smooth}`, measuring right after `focus()`/`hover()` catches both pages mid-scroll at different offsets. `window.scrollTo({top:0, behavior:'instant'})` + a settle wait before measuring.

## Limitations

- Only **Vue 3** ships out of the box; other frameworks need a `references/framework/<name>.md`.
- Pixel diff is environment-sensitive (anti-aliasing/fonts) — treated as a signal; the computed-style diff + a11y carry the weight. Run VRT single-OS for determinism.
- Verification needs a browser/Playwright; if unavailable, fall back to structured manual inspection and report it — never claim parity unproven.

## License

MIT.

---
description: Migrate an HTML/CSS UI prototype into Vue 3 components with visual fidelity (preserve, don't redesign)
argument-hint: <prototype-path> [--target <dir>] [--framework vue]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

Migrate the prototype at `$1` into a component-based frontend, following the
**ui-prototype-migration** skill exactly. Treat
[`skills/ui-prototype-migration/SKILL.md`](../skills/ui-prototype-migration/SKILL.md)
as the source of truth for the workflow — do not improvise a different one.

Full argument string: `$ARGUMENTS`

## Flags

- `<prototype-path>` — the prototype to migrate (a single `.html` file or a directory). If omitted, ask which; don't guess.
- `--target <dir>` — where to create the target app (default: a sibling `_migrated/` dir).
- `--framework <vue>` — target framework, default `vue` (Vue 3 first; others need a `references/framework/<name>.md`).

## Required behaviour

1. **Inspect** every prototype file (HTML, CSS — embedded `<style>`, external, inline `style=""` — tokens, `@media`, JS, assets, fonts, states) **before** writing code. Record findings.
2. **Inventory** the UI (layout / UI / composite / page-level) from what the prototype actually contains.
3. **Port 1:1** — templates + the prototype's CSS **verbatim**. Co-locate styles per component in `<style scoped>` (global only tokens + base + shell + shared atoms). Keep class names AND element ids (id prop for reused components). Do NOT add wrapper elements the prototype lacks. Reproduce all JS behavior.
4. Mind the **scoped + slotted trap**: any scoped rule styling slotted content (e.g. `.btn svg`) must use `:deep()`, or it silently collapses.
5. **Verify** (Phase 4) — run both prototype and target and compare per view × theme × viewport. Use `/verify-parity` (or `scripts/compare-visuals.mjs`) for computed-style + bbox diff; add screenshots + axe a11y.
6. **Iterate** until 0 real differences. Done = a passing diff with evidence — NOT a clean build.
7. **Refactor** only after parity.

Hard rules (from SKILL.md): exact CSS values (no Tailwind/utility snapping), no UI-library substitution, no silent invention, no redesign. The prototype is the visual + behavioral source of truth.

Reference detail: [`references/`](../skills/ui-prototype-migration/references/) (`css-preservation.md`, `componentization.md`, `visual-verification.md`, `framework/vue.md`).

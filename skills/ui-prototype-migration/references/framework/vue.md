# Vue 3 Migration Target

> Framework-specific guidance for migrating a prototype into **Vue 3**. This file
> intentionally contains no generic migration methodology — that lives in
> `SKILL.md` and the other references. Keep framework concerns separate so the
> methodology stays framework-agnostic.

## Table of contents
1. [Conventions to follow](#conventions-to-follow)
2. [Project setup](#project-setup)
3. [Template → `<template>`](#template--template)
4. [Carrying the CSS over](#carrying-the-css-over)
5. [Props and emits](#props-and-emits)
6. [State and interactivity](#state-and-interactivity)
7. [Slots](#slots)
8. [Routing & pages](#routing--pages)
9. [Avoid unless the prototype needs it](#avoid-unless-the-prototype-needs-it)
10. [Host-project conventions win](#host-project-conventions-win)

---

## Conventions to follow

- **`<script setup>` + Composition API.** No Options API unless the host project
  already uses it.
- Small, cohesive components — one responsibility each (see [componentization.md](../componentization.md)).
- Explicit, typed `props` and `emits`.
- One `.vue` file per component; co-locate the component's styles in a
  `<style scoped>` block (or follow the host project's convention).
- Predictable component APIs — no surprising side effects.

## Project setup

Prefer the official tooling the host project already uses. For a greenfield
target, Vite + Vue is the default:

```bash
npm create vue@latest
```

Do **not** add a UI component library, a state library, or a CSS framework
unless the prototype (or the host project) already depends on it. Adding them is
a redesign risk (see [css-preservation.md](../css-preservation.md)).

## Template → `<template>`

Move the prototype's HTML into `<template>` nearly 1:1:

- Preserve semantic tags (`<nav>`, `<aside>`, `<table>`, `<button>`, …). Don't
  flatten to `<div>`.
- Preserve the prototype's class names — they are the bridge to the copied CSS.
- Convert repeated markup to `v-for`; conditional markup to `v-if`/`v-show`
  only where the prototype repeats or conditionally shows it.
- Replace prototype placeholder data with props/`defineProps`; keep the same
  structure and order the prototype rendered.
- Bind event handlers (`@click`, `@input`, …) to reproduce the prototype's JS.
- For `v-html`/raw HTML, prefer real template structure; only use `v-html` when
  the prototype injects HTML at runtime.

Example (prototype `.stat-card` ×3 → one component):

```vue
<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  badge: { type: String, default: "" },
  badgeTone: { type: String, default: "up" }, // prototype only ever used up/down
});
</script>

<template>
  <article class="stat-card">
    <span class="stat-card__label">{{ label }}</span>
    <span class="stat-card__value">{{ value }}</span>
    <span v-if="badge" class="badge" :class="`badge--${badgeTone}`">{{ badge }}</span>
  </article>
</template>

<style scoped>
.stat-card {
  /* copied verbatim from the prototype's components.css */
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md); /* resolves to 14px, unchanged */
  box-shadow: var(--shadow-card);
  padding: var(--space-3); /* 18px, unchanged */
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
/* …rest verbatim… */
</style>
```

## Carrying the CSS over (co-locate per component)

**Default: each component owns its styles in its own `<style scoped>` block.**
Do **not** dump the whole prototype stylesheet into one global `style.css` and
call the migration done — that produces a working render but a monolithic,
unmaintainable file that defeats the point of componentization. Co-locate.

Split the prototype's CSS by **who owns each rule**:

- **Global (one shared import, e.g. `src/styles/tokens.css` + `base.css`):**
  - design tokens — `:root { … }` and `[data-theme="dark"] { … }` (every
    component must resolve the same custom properties).
  - base/reset rules (`*`, `html`, `body`, `a`, `button`, headings resets).
  - the **app-shell layout** that frames pages (`.app` grid, `.sidebar`,
    `.topbar`, `.content`, `.breadcrumbs`) — these belong to the shell/root
    component, not to the atoms inside it.
  - genuinely shared atoms used across many components **and** not owned by a
    single component (e.g. `.card`, `.muted`, `.num`, `.sr-only`). If an atom
    has one owning component (`.btn` → `Button.vue`, `.avatar` → `Avatar.vue`),
    put its rules in that component and drop the global copy.
- **Per-component `<style scoped>`:** every rule owned by that component — its
  own block, elements, modifiers, states, and the styles of the markup it
  renders. Example: KPI rules live in `KpiCard.vue`, table+pager in the table
  component, chart anatomy in each chart component, `.cmd` in `CommandPalette.vue`,
  `.modal`/`.overlay` in `ConfirmModal.vue`, `.toast` in `ToastStack.vue`, form
  controls in the settings component, etc.

```vue
<!-- Button.vue — owns the .btn rules, scoped -->
<script setup>
defineProps({ variant: { type: String, default: "primary" } });
</script>
<template>
  <button class="btn" :class="`btn--${variant}`"><slot /></button>
</template>
<style scoped>
.btn { padding: 10px 18px; border-radius: var(--r-sm); /* verbatim */ }
.btn--primary { background: var(--primary); color: #fff; }
/* …verbatim… */
</style>
```

**Keep the prototype's class names** (BEM or otherwise) — they are the bridge to
the rules and removing them is a needless change. Scoping makes long BEM names
less *necessary*, but keeping them is lower-risk for fidelity. Do not rename.

### Specificity caveats with `<style scoped>`

Vue scopes by adding an attribute selector (`[data-v-xxxx]`) to each selector,
which **raises** specificity slightly. Re-verify after distributing. The
co-location step is where most post-parity regressions appear — treat it as a
change that **requires a fresh visual-diff**, not a cosmetic refactor.

- **Slotted content is NOT scoped to the component (the #1 co-location bug).**
  Elements a `<slot>` receives come from the **parent** (icons, labels, custom
  children). A rule in this component's `<style scoped>` gets `[data-v-xxx]`
  appended and will **silently fail to match** slotted nodes. The classic
  failure: `.btn svg { width:16px }` in `Button.vue` does not apply to an icon
  passed via `<slot>`, so the icon collapses to 0 width and the button shrinks.
  Use `:deep()` for anything styling slotted/child-injected content:
  `.btn :deep(svg) { width:16px; height:16px }`. Audit every `... svg`,
  `... > *`, and descendant rule in a scoped block for this.
- Styles that must reach into a **child component's** own markup (e.g. a table
  cell styling a child `<Avatar>`) likewise need `:deep(...)`, or move that rule
  to the parent's scope.
- A component rule that previously lost to a global rule may now **win** (or vice
  versa) — re-check hover/focus/active and any rule that competed with a global
  one.
- Inline `style=""` and inline custom properties (`--accent`, `--status`) still
  win on specificity — keep them via `:style` bindings resolving to the same
  authored string; scoping does not affect them.

If scoping a particular rule keeps breaking parity, leave **that rule** global
with a comment saying why — don't fall back to dumping *everything* global.

### Do not add wrapper elements the prototype doesn't have

A component's root must reproduce the prototype's box tree 1:1. Don't insert an
extra wrapper `<div>` "to hold things together" — it becomes a new box in the
flex/grid chain and shifts siblings (alignment, `gap`, `align-items:center`
all change). If the prototype had `card-body > [svg, legend]` as siblings, the
component must emit those same siblings (Vue 3 allows multiple root nodes), not
`card-body > wrapper > [svg, legend]`. Extra wrappers are a silent layout drift
that pixel-diff catches but code review misses.

### Preserve element ids, not just classes

The prototype's `id="..."` attributes are part of the DOM contract — its CSS
(e.g. `#menuToggle`) and JS reference them, and they anchor the visual-diff
selector list. Carry every prototype `id` onto the equivalent element in the
target (chart `<svg id="trendChart">`, toggle buttons, panels). When a component
is reused for several prototype elements with different ids (e.g. a line-chart
component used for both `#trendChart` and `#auChart`), take an `id` prop and
pass the prototype's id per use. Dropping ids breaks fidelity and breaks
verification selectors.

**Values stay verbatim regardless of location** — no utility conversion, no
token renaming (see [css-preservation.md](../css-preservation.md)).

## Props and emits

- Declare only the props the prototype's variation requires (see
  [componentization.md §Props](../componentization.md#props-slots-and-content-projection)).
- Use `defineEmits` for events the prototype actually fires (e.g. a custom
  dropdown emitting `update:open`). Don't invent events.
- Validate prop types to match the data the prototype renders.

## State and interactivity

Model the prototype's JS with Composition API primitives:

- dropdown open/close → `const open = ref(false)` + `@click`, outside-click and
  Escape handlers (port the prototype's exact behavior).
- tabs → `const active = ref('recent')`.
- mobile sidebar → `const sidebarOpen = ref(false)` toggled by the hamburger,
  matching the prototype's `.is-open` class.

Keep state **local** unless the prototype shared it across distant components.
Prefer `provide`/`inject` or a composable only when genuinely needed. Do not
add Pinia/Vuex the prototype didn't have.

Preserve hover/focus/active/disabled via the same CSS the prototype used — do
not reimplement them with component state unless the prototype did.

## Slots

Use `<slot>` for regions where the prototype has free-form inner content (panel
body, modal content, page layout regions). Don't over-slot; one default slot is
usually enough where the prototype had one content area.

## Routing & pages

If the prototype has multiple pages (`dashboard`, `users`, `settings`):

- Inspect how the prototype links between them (anchor `href`, JS navigation).
- Introduce Vue Router only if the prototype's page-to-page relationships imply
  real routes. Mirror the prototype's URL structure.
- One page-level component per prototype page.

If the prototype is a single page, don't add a router.

## Avoid unless the prototype needs it

- ❌ A UI library (Element Plus, Naive, Vuetify, PrimeVue) — its components have
  their own styles and will not match the prototype.
- ❌ Pinia/Vuex for state the prototype held locally.
- ❌ Tailwind/utility CSS as the first pass (later, optional, re-verified phase only).
- ❌ Custom design-system abstractions the prototype never used.
- ❌ SSR/Nuxt unless the host project is already Nuxt.

## Host-project conventions win

If you are migrating **into an existing** Vue app, its conventions override the
defaults above wherever they conflict — directory layout, naming, styling
approach (CSS Modules vs scoped vs the project's existing framework), testing,
routing. Inspect the target first and follow it. Only escalate to the user if a
host convention would break visual fidelity.

The skill's generic rules never override the host project's established
architecture unless the user explicitly asks.

## Migrating into an existing app (host conventions)

The common real-world case: the target is an **existing** app — not a greenfield
scaffold. It already has a component library, a styling system (scoped CSS, CSS
Modules, Tailwind, a design system…), a routing setup, and conventions for
where files live. The skill ports the prototype's *render* into that host; the
host's conventions decide *how files are organized and routed*, but the
prototype still defines *what renders*.

**Inspect the host first.** Read its `CLAUDE.md`/`AGENTS.md`, the styling entry
(e.g. `app.css`/`@theme`, a Tailwind config, a tokens file), the component
folder (e.g. `components/ui/`, `lib/utils`), `layouts/`, and the page/route
structure. Follow the host's naming, directory layout, and routing for anything
you add.

**Map primitives by resolved values — don't blindly substitute.** For a
prototype element that a host component happens to cover (a `Button`, `Card`,
`Badge`…):

1. Compare the **resolved values**, not the names. A host `<Button>` styled
   `h-9 px-4 py-2 rounded-md` (≈36px/16px/6px) does **not** match a prototype
   `.btn` (`padding:10px 18px; border-radius:7px`). Substituting "because the
   name fits" is a redesign.
2. **Reuse the host primitive only when its resolved values are actually
   equivalent.** Otherwise keep the prototype's bespoke markup + CSS (in
   `<style scoped>` or a local stylesheet), even inside the host project.
3. A middle path: reuse the host primitive as the **behavioral shell**
   (props/emits/keyboard/a11y) and override its styles with the prototype's
   exact values (`:deep()`, a `cn()` merge, or a scoped override) — re-verifying
   visually.
4. Never pour the prototype's tokens into the host's token layer "for
   convenience" unless the resolved values are identical.

**Chrome/shell.** If the host has a layout shell (sidebar/topbar), use it as the
frame **only if** it visually matches the prototype's shell. If it differs, port
the prototype's shell for fidelity — don't inherit the host's look.

**One concrete instance — a shadcn-vue + Tailwind + Inertia host (Laravel).**
Pages live under `resources/js/pages/` as Inertia page components; primitives
under `components/ui/` (alias `@/components/ui`); styling via Tailwind v4
`app.css` `@theme`. Each prototype "view" becomes a page component routed through
Inertia; apply the resolved-value rule above before reaching for
`<Button>`/`<Card>`. This is just one example of the general pattern — the same
rules hold for a plain Vue + vue-router app, a React/Next app, etc. The routing
layer (Inertia, vue-router, Next, …) is plumbing; it doesn't change the
HTML/CSS → component contract.

**Verification is the same gate.** Even inside a host, "done" still requires a
passing `verify-parity` diff of the migrated screens vs the prototype — host
conventions don't loosen the visual contract.

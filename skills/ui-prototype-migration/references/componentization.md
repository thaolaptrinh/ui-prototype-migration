# Componentization

> Component boundaries must come from the **prototype's structure and reuse**,
> not from an imagined ideal architecture. The goal is an equivalent component
> tree, not a redesigned one.

## Table of contents
1. [Principle](#principle)
2. [Build a UI inventory first](#build-a-ui-inventory-first)
3. [When to extract a component](#when-to-extract-a-component)
4. [When NOT to extract](#when-not-to-extract)
5. [Signal-driven shape: partial, primitive, or composite?](#signal-driven-shape-partial-primitive-or-composite)
6. [Mapping DOM → component tree](#mapping-dom--component-tree)
7. [Naming](#naming)
8. [Props, slots, and content projection](#props-slots-and-content-projection)
9. [State and interactivity](#state-and-interactivity)
10. [Reuse vs. the host project](#reuse-vs-the-host-project)
11. [Checklist](#checklist)

---

## Principle

Componentization changes **implementation structure**, not **visual output**.
After splitting into components, the rendered DOM/CSS must produce the same
pixels as the prototype. If componentizing changes the render, you changed too
much — back out until parity returns, then split more conservatively.

Use the **smallest reasonable abstraction** that preserves the original layout.

## Build a UI inventory first

Before creating any component file, classify what the prototype contains.
Don't invent categories the prototype doesn't have.

**Layout primitives** — page shell, header/topbar, sidebar, navigation, content
container, grid, stack, toolbar.

**UI primitives** — button, input, select, checkbox, radio, badge, avatar,
icon button, pill.

**Composite components** — search bar, filter panel, data table, stat card,
user card, modal, dropdown/menu, pagination, tabs.

**Page-level structures** — dashboard, users page, settings, detail page.

Record the inventory. Each entry should cite **where it appears and how many
times**. Repetition is the strongest signal for extraction.

## When to extract a component

Extract a piece into its own component when **at least one** is true:

- **It is reused** — appears more than once with the same structure/responsibility
  (e.g. a `.stat-card` rendered 3×, a `.btn` used across the page).
- **It has meaningful independent behavior** — owns state or events
  (a dropdown that opens/closes, tabs that switch).
- **It represents a single coherent UI responsibility** — a search bar (input +
  icon + wrapper), a data table, a filter panel.
- **It is complex enough to justify isolation** — a long, distinct region whose
  internals would clutter the page.

Do not extract merely because a DOM node exists.

## When NOT to extract

Avoid these failure modes:

- **One component per element** — wrapping every `<div>` in its own component.
- **Over-componentization** — splitting a card into `Card`, `CardHeader`,
  `CardBody`, `CardBadge`, `CardValue` when the prototype had one `.stat-card`.
- **Premature design-system abstraction** — building a generic `<Badge>` meant
  to serve hypothetical future products, with variant enums the prototype
  never used.
- **Theoretical-reuse components** — "someone might reuse this" is not a reason.
- **Substituting a UI library** — replacing the prototype's bespoke card with
  `<LibraryCard>` because it "looks similar". It does not look identical; the
  padding/radius/shadow will differ. (See [css-preservation.md](css-preservation.md).)
- **Splitting before parity** — if extracting a component changes the render,
  stop and re-establish parity first.

If the prototype has a single, flat block of markup, a single component (the
page) is a correct answer.

## Signal-driven shape: partial, primitive, or composite?

Don't pick a component's shape from a fixed template — **read it from what the
prototype demonstrates**. The same kind of element can correctly be a one-off
partial, a reusable primitive with a variant API, or a composite, depending on
the signals the prototype sends. Designing a primitive "because buttons should
be primitives" without a prototype signal is over-engineering; **failing** to
model a primitive when the prototype clearly shows many variants is
under-engineering. Both break fidelity or maintainability.

| Prototype signal | Shape to use | Example |
| --- | --- | --- |
| Appears **once**, no variation, page-coupled | **Partial** — inline markup or a thin local component. No variant enum, no speculative props. | A one-off hero/header block. |
| Repeated (**≥ 2**) with a **bounded set of differences** (variants / sizes / tones / states) | **Primitive + a `variant` (or `size`/`tone`) prop** — enumerate **exactly** the variants the prototype shows. | `.btn--primary`, `.btn--ghost`, `.btn--danger` → `<Button variant="primary\|ghost\|danger">`. |
| Repeated but differs **only by data** | **Primitive + data props** (no variant enum needed). | `.stat-card` ×3 → `<StatCard :label :value :badge>`. |
| Several primitives/elements composed into one UI responsibility, often with behavior | **Composite**. | `.search` = icon + input; `.menu` = trigger + panel + open/close logic. |
| Wraps content supplied from outside | Add a **slot**, not more props. | panel body, modal content. |

### The variant rule

When you build a primitive with a variant API, each variant maps to the
prototype's **exact** class/CSS, carried verbatim — never to a UI-library's
scale, and never to a variant the prototype did not use.

```text
prototype defines:  .btn--primary { background:#2f5ffb }  .btn--ghost { border:1px solid … }
   → <Button variant="primary">  applies the EXACT .btn--primary CSS (verbatim)
     <Button variant="ghost">    applies the EXACT .btn--ghost CSS
   ✗ do NOT add variant="link" if the prototype has no .btn--link
   ✗ do NOT snap the primary background to a library's blue-600
```

A variant API is **faithful** (allowed in Phase 3) when the prototype
**demonstrates** those variants. Inventing variants the prototype lacks is
**anticipated abstraction** — defer it to Phase 6 or drop it.

### Phase timing, precisely

- Prototype **already shows** the reuse and the variants (multiple `.btn--*`
  classes actually used across the page) → model the primitive + variant API in
  **Phase 3**. This is a 1:1 mapping of existing structure, not added
  abstraction, so it does not threaten parity.
- You merely **imagine** the project might want a primitive/variant/slot the
  prototype never exercises → that is **Phase 6** (or never). Build the smallest
  faithful thing now; generalize later, after parity, re-verifying.

The test for "is this primitive justified now?": **does the prototype already
contain the variants/states/reuse I'm encoding?** Yes → build it. No → defer.

## Mapping DOM → component tree

Aim for a near 1:1 relationship between meaningful prototype regions and
components:

```
prototype DOM region   →   one component
   (keeps its markup)
   (keeps its CSS, now scoped to the component)
```

Not:

```
prototype DOM   →   AI invents a new architecture   →   different structure
```

Preserve:

- the **HTML tag semantics** (`<nav>`, `<aside>`, `<table>`, `<button>`) — don't
  flatten everything to `<div>`. Semantic tags affect accessibility and some
  default styling.
- the **class structure** as the bridge to the (copied) CSS.
- the **element ids** — prototype CSS/JS and your verification selectors anchor
  on them (`#menuToggle`, `#trendChart`). Carry each id onto the equivalent
  element; for a component reused across several ids, take an `id` prop.
- the **nesting depth / box tree** — a flex/grid parent depends on its *direct*
  children. Do **not** insert a wrapper element the prototype doesn't have (a
  component root must emit the same children the prototype region did — use
  multi-root where needed). An extra wrapper becomes a new box and silently
  shifts `gap`/`align`/sibling geometry — pixel-diff catches it, code review
  doesn't.

## Naming

Name components from the prototype's own vocabulary where it exists
(`Sidebar`, `Topbar`, `StatCard`, `UserMenu`). If the prototype's class names
are generic (`card`, `panel`), pick the most descriptive concrete name and keep
it stable. Don't invent an elaborate naming convention mid-migration.

## Props, slots, and content projection

Introduce props/slots only as the prototype's variation requires:

- If `.stat-card` differs only by label/value/badge → props `label`, `value`, `badge`.
- If a region has free-form inner content → a slot/default content area.
- Do **not** add props/variants the prototype never exercises (no `size="lg"`
  if the prototype only has one size). You can add them later, after parity.

## State and interactivity

Carry over behavior from the prototype's JS/handlers:

- dropdown open/close + outside-click + escape,
- tab switching,
- mobile sidebar toggle,
- form field interactions,
- hover/focus/active/disabled/loading states.

Model each as local component state where the prototype modeled it locally.
Don't introduce global state management (Pinia/Redux) the prototype didn't have.
(See [framework/vue.md](framework/vue.md) for Vue specifics.)

If the prototype's behavior is unclear, do **not** invent it — flag the
ambiguity. (See SKILL.md §"Avoid hallucination".)

## Reuse vs. the host project

When migrating into an **existing** target app:

1. Inspect the target's component library and conventions first.
2. Reuse an existing target component **only if** it is visually and behaviorally
   compatible *and* reproduces the prototype's render (verify — don't assume
   from the name).
3. Otherwise create a new component following the target's conventions
   (directory, naming, styling approach) but with the prototype's markup/CSS.

Never reuse a component merely because its name sounds appropriate.

## Checklist

- [ ] Every component maps to a real prototype region (no invented structure).
- [ ] No component exists for a single non-reused trivial element ("trivial" = flat markup with no state, no behavior, and ≤2 children — e.g. a lone `<h2>`, `<p>`, `<span>`; an icon+label pair is not trivial).
- [ ] Every variant/size/tone prop corresponds to a variant the prototype actually demonstrates — no invented variants.
- [ ] No UI-library substitution changed the render.
- [ ] Tag semantics preserved.
- [ ] Prototype element ids carried onto the equivalent elements (id prop where a component is reused).
- [ ] No extra wrapper element introduced that the prototype doesn't have (box tree is 1:1).
- [ ] Behavior from the prototype's JS carried over.
- [ ] No state management added that the prototype didn't have.
- [ ] Render is pixel-identical to the prototype after componentizing.

# CSS Preservation

> The prototype's CSS is a specification, not a suggestion. Migration must
> reproduce the **resolved render**, value-for-value, before any refactor.

## Table of contents
1. [The golden rule](#the-golden-rule)
2. [Where prototype CSS lives](#where-prototype-css-lives)
3. [The approved migration sequence](#the-approved-migration-sequence)
4. [Value preservation — exact, not approximate](#value-preservation--exact-not-approximate)
5. [Design tokens / CSS variables](#design-tokens--css-variables)
6. [Specificity and selector structure](#specificity-and-selector-structure)
7. [Scoped styles per framework](#scoped-styles-per-framework)
8. [When you MAY change a value](#when-you-may-change-a-value)
9. [Forbidden transformations](#forbidden-transformations)
10. [Anti-patterns](#anti-patterns)

---

## The golden rule

A value that **renders identically** may be re-expressed only if the re-expression
is **provably equivalent**. "Approximately the same" is never acceptable during
migration. Refactoring into utilities/design-tokens is a **later, optional**
phase that runs *after* visual parity is verified — never as the first pass.

**Violating the letter of these rules is violating the spirit of these rules.**

## Where prototype CSS lives

Before touching styles, locate and read **all** of it:

- `<link>` / `<style>` blocks in every HTML page
- external `.css` files (one or many — e.g. `tokens.css`, `base.css`, `layout.css`, `components.css`)
- inline `style="…"` attributes (note: these win on specificity)
- CSS custom properties (`:root { --… }`) and any `@theme`/token maps
- `@media`, `@supports`, `@container` rules
- CSS used only under a state class (`.is-open`, `.is-active`, `[data-theme="dark"]`)
- Font-face declarations and webfont imports

Record the prototype's **stylesheet inventory**. You will reproduce it.

## The approved migration sequence

```
prototype HTML + CSS
   → framework template + the SAME CSS (copied/scoped, values verbatim)
      → verify visual parity in a browser
         → componentize (split templates, keep styles with each component)
            → refactor for maintainability (still pixel-identical)
               → OPTIONAL token/utility consolidation (only if intended + re-verified)
```

Only move rightward once the previous stage is verified. The first vertical drop
(template + verbatim CSS) is the most important and is where most fidelity is
won or lost.

## Value preservation — exact, not approximate

Carry the prototype's computed intent into the target. Do **not** snap to the
nearest "nice" value.

| Prototype says | Wrong (approximate) | Right |
| --- | --- | --- |
| `padding: 18px` | `p-4` (16px) | `padding: 18px` (or a token whose value is exactly `18px`) |
| `border-radius: 14px` | `rounded-xl` (12px) | `border-radius: 14px` |
| `gap: 7px` | `gap-2` (8px) | `gap: 7px` |
| `box-shadow: 0 6px 20px rgba(27,33,56,.06)` | `shadow-md` | the exact shadow string |
| `#2f5ffb` | `blue-600` | `#2f5ffb` |

Utility classes (Tailwind, UnoCSS, …) map to **discrete** values. Prototype
values are frequently **between** those steps. Snapping to the nearest step
**changes the render**. That is a redesign, not a migration.

The only acceptable use of a utility class is one whose generated value is
**byte-for-byte equal** to the prototype's resolved value, *and* the project has
chosen that abstraction deliberately.

## Design tokens / CSS variables

Preserve the prototype's design tokens **verbatim**:

- Copy `:root { … }` custom properties unchanged (same names, same values).
- Do not rename `--color-primary` → `--brand-500` "for consistency" during migration.
- Do not round `--space-3: 18px` to `16px`.
- If the target project already has a token system, **map prototype tokens to
  target tokens only where the resolved values are equal**; otherwise keep the
  prototype's token at its original value. Flag the conflict to the user rather
  than silently picking one.

Tokens are where "creative rounding" hides. Audit token values against the
prototype during verification.

## Specificity and selector structure

Visual output depends on **resolved** CSS, which depends on specificity and
source order. To preserve the render:

- Keep selector specificity close to the prototype. Don't wrap everything in an
  extra `:where()` / extra parent class that shifts specificity.
- Preserve source order between stylesheets that override each other.
- Inline `style` attributes in the prototype must be reproduced (or moved into a
  rule of equal-or-higher winning specificity) — they are not optional detail.
- Don't replace a class-based rule with an inline style or vice versa if it
  changes which rule wins on hover/focus/etc.

If you componentize and move a rule into a `<style scoped>` block, verify the
scoped attribute selector doesn't accidentally lower specificity below a
competing global rule. (See [Scoped styles](#scoped-styles-per-framework).)

## Scoped styles per framework

Co-locate each component's CSS in that component's style block — **do not ship
one monolithic global stylesheet.** Only tokens, base/reset, the app-shell
layout, and genuinely shared atoms stay global; everything else moves into the
component that owns it. (Framework specifics: [framework/vue.md](framework/vue.md#carrying-the-css-over-co-locate-per-component).)

- **Vue 3 `<style scoped>`** — the default. Adds an attribute selector
  (`[data-v-xxxx]`), slightly raising specificity; re-verify rules that competed
  with a global one. Use `:deep(...)` only for a rule that must reach into child
  component markup the prototype styled that way.
- **CSS Modules** — class names are hashed; fine as long as every class is mapped
  to its owning component.
- Keep a rule global **only** when no single component owns it (tokens, base,
  shell layout, cross-cutting atoms) — not as a shortcut to avoid distributing.

## When you MAY change a value

You may change a CSS value during migration only when:

1. The change is **provably render-neutral** (you computed it, and verified in a
   browser), **or**
2. The user **explicitly** requested it, and you re-verify afterward.

Anything else is a redesign. When unsure, preserve verbatim and ask.

## Forbidden transformations

Do **not**, during the first migration pass:

- Convert custom CSS to Tailwind/utility classes by approximation.
- Replace a CSS variable with a hardcoded "equivalent".
- Merge or split stylesheets for tidiness.
- "Normalize" inconsistent values (e.g. one card at `18px` and another at `17px`
  → both `16px`). The inconsistency may be intentional; preserve it.
- Replace the prototype's font stack/weights with a default.
- Drop a `@media` query because "Tailwind handles responsiveness".
- Substitute a generic UI-library component's built-in styles for the prototype's.

## Anti-patterns

| Smell | Why it breaks fidelity |
| --- | --- |
| "I'll just use Tailwind, it's basically the same" | Discrete utility values ≠ continuous prototype values → visible drift. |
| Renaming tokens to match a "standard scale" | Changes resolved values. |
| Merging stylesheets "to clean up" | Alters source order / override behavior. |
| Removing inline styles "because they're ugly" | Inline styles win on specificity; removing them changes the render. |
| Trusting the diff by eye | Many value changes are sub-pixel or only show at certain viewports. Verify in browser. |

See [visual-verification.md](visual-verification.md) for how to **prove** the
CSS survived the migration.

# Prototype fixtures

Sample prototypes to practice/validate the `ui-prototype-migration` skill. Each
is a different shape, so the skill is tested across layout types — not just one.

| Fixture | Shape | Style | What it stresses |
| --- | --- | --- | --- |
| [`prototype-dashboard/`](prototype-dashboard/) | single-file admin SPA, 5 hash-routed views + login | data-dense (Fira), light+dark | charts, data table (sort/filter/select/paginate/skeleton), forms, command palette, embedded style/script + inline styles |
| [`prototype-landing/`](prototype-landing/) | single-file marketing landing (one scroll page) | vibrant block-based (Barlow), light+dark | hero, feature/pricing/testimonial/FAQ sections, carousel, accordion, scroll progress |
| [`prototype-multipage/`](prototype-multipage/) | **multi-page** (home + pricing), shared external CSS, `<a href>` nav | editorial (Fraunces+Inter), light+dark | multi-page handling, page-to-page navigation, shared stylesheet, theme persist across pages |

Run any of them, e.g.:

```bash
python3 -m http.server 5188 --directory examples/fixtures/prototype-dashboard
python3 -m http.server 5187 --directory examples/fixtures/prototype-landing
python3 -m http.server 5186 --directory examples/fixtures/prototype-multipage
```

Each has a `selectors.example.json` (array, or per-view map for multi-page) for
`scripts/verify-parity.mjs`.

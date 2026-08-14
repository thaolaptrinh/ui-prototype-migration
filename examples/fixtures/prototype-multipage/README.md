# Verdant — Multi-page Prototype Fixture

Third fixture for `ui-prototype-migration`: **multiple HTML pages** sharing one
stylesheet and linked by plain `<a href>` (not a SPA). Tests the skill's Phase-1
"all HTML pages" handling + page-to-page navigation + routing in the target.

Two pages — `home.html` + `pricing.html` — sharing `styles.css` (external file,
not embedded): editorial style (Fraunces + Inter), brand green + terracotta
accent, light + dark (persisted across pages via `localStorage`), reused atoms
(buttons/badge/card/nav) across both pages, breakpoint 900px.

| Dimension | Where |
| --- | --- |
| Multi-page | `home.html`, `pricing.html`, shared `styles.css` |
| External CSS file (not embedded) | `styles.css` |
| Page-to-page nav | `<a href="pricing.html">`, active state per page |
| Theme persistence across pages | `localStorage` read on each page load |
| Reuse | buttons/badge/card/feat/plan across pages |

Run:

```bash
python3 -m http.server 5186 --directory examples/fixtures/prototype-multipage
# open http://127.0.0.1:5186/home.html
```

`selectors.example.json` is a **per-view map** (`{ "home": [...], "pricing": [...] }`)
— `scripts/verify-parity.mjs` compares each page's selectors against the
migrated target's equivalent route.

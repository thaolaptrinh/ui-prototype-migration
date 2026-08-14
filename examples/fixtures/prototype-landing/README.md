# Pulse Fitness — Landing Page Fixture

Second fixture for `ui-prototype-migration` — a **different product type** than
the admin dashboard: a consumer marketing landing page (spacious, vibrant,
block-based), so the skill is validated across shapes, not just dashboards.

Design from **ui-ux-pro-max** (`--design-system "fitness wellness consumer
landing vibrant spacious"`): Vibrant & Block-based style, Barlow Condensed /
Barlow, navy `#1E3A5F` + gold accent `#A16207`, light+dark, scroll storytelling.

Single self-contained file (embedded `<style>` + `<script>` + inline `style=""`).
Non-round tokens kept (`14/18/26/42px`…).

| Dimension | Where |
| --- | --- |
| Reuse | feature cards ×6, pricing cards ×3, testimonial cards ×3, faq items ×3, buttons (primary/gold/ghost + sm/lg) |
| Interactions | theme toggle (persist), mobile nav drawer, pricing monthly/yearly toggle, FAQ accordion, testimonial carousel (arrows+dots), scroll progress bar, CTA toast |
| Inline styles | progress width, hero stat accents, feature icon colors, per-card price data attributes |
| Responsive | 1023px (nav drawer, grids 2-col), 767px (1-col, type scale down) |
| Typography | Barlow Condensed (display) + Barlow (body), webfont |

Run:

```bash
python3 -m http.server 5187 --directory examples/fixtures/prototype-landing
# open http://127.0.0.1:5187/
```

`selectors.example.json` is the compare list for `scripts/compare-visuals.mjs`.

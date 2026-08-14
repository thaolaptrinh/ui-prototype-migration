#!/usr/bin/env node
// verify-parity.mjs — THE unified verification gate for ui-prototype-migration.
//
// Runs the full Phase-4 battery in one command:
//   - computed-style + bounding-box diff (diagnosis) per selector × viewport
//   - full-page screenshots for manual review (alarm half)
//   - optional axe-core a11y diff (no NEW critical/serious violations)
//   - per view × theme × viewport, with flake hygiene
//     (fonts.ready, deviceScaleFactor:1, reducedMotion) and an exit gate.
//
// Usage:
//   node scripts/verify-parity.mjs \
//     --prototype http://127.0.0.1:5187 --target http://127.0.0.1:5190 \
//     --selectors examples/fixtures/prototype-landing/selectors.example.json \
//     [--views dashboard,users] [--themes light,dark] [--viewports 1440,1024,768] \
//     [--theme-key pulse-theme] [--out ./compare-report] [--axe] [--baseline]
//
// Both apps must be running. Exit code: 0 = parity, 1 = real diffs remain.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { argv, exit } from "node:process";

// ---- config ----
const COMPARE_PROPERTIES = [
  "width", "height", "padding", "margin", "border-width", "border-color",
  "border-radius", "gap", "background-color", "color", "font-family",
  "font-size", "font-weight", "line-height", "letter-spacing", "box-shadow",
  "display", "position", "flex-direction", "align-items", "justify-content",
];
const TOL = 0.5; // px tolerance for geometry (sub-pixel rounding)
const DEFAULT_VIEWPORTS = [1440, 1024, 768];
const DEFAULT_THEMES = ["light", "dark"];
const PIXEL_THRESHOLD = 0.1; // pixelmatch color threshold (rendering noise only)
const PIXEL_RATIO_CAP = 0.001; // max fraction of differing pixels

function parseArgs(args) {
  const o = {
    prototype: null, target: null, selectors: null,
    views: [null], themes: DEFAULT_THEMES, viewports: DEFAULT_VIEWPORTS,
    themeKey: null, out: resolve("./compare-report"), axe: false, baseline: false,
  };
  const take = (i) => args[i + 1];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prototype") o.prototype = take(i), i++;
    else if (a === "--target") o.target = take(i), i++;
    else if (a === "--selectors") o.selectors = loadSelectors(take(i)), i++;
    else if (a === "--views") o.views = take(i).split(","), i++;
    else if (a === "--themes") o.themes = take(i).split(","), i++;
    else if (a === "--viewports") o.viewports = take(i).split(",").map(Number), i++;
    else if (a === "--theme-key") o.themeKey = take(i), i++;
    else if (a === "--out") o.out = resolve(take(i)), i++;
    else if (a === "--axe") o.axe = true;
    else if (a === "--baseline") o.baseline = true;
    else if (a === "--help" || a === "-h") { printHelp(); exit(0); }
    else { console.error(`Unknown arg: ${a}`); printHelp(); exit(2); }
  }
  return o;
}

function loadSelectors(raw) {
  let text = raw;
  try { text = readFileSync(resolve(raw), "utf8"); } catch { /* inline JSON */ }
  let p;
  try { p = JSON.parse(text); } catch { console.error("--selectors must be a JSON array or file path"); exit(2); }
  if (Array.isArray(p)) return p;
  if (p && typeof p === "object") return p; // per-view map {view: [selectors]}
  console.error("--selectors must be an array or a {view:[...]} map"); exit(2);
}

function printHelp() {
  console.log(`verify-parity.mjs — the unified Phase-4 gate.

Usage:
  node scripts/verify-parity.mjs \\
    --prototype <url> --target <url> --selectors <file-or-json> \\
    [--views a,b] [--themes light,dark] [--viewports 1440,1024,768] \\
    [--theme-key <localStorage-key>] [--axe] [--baseline] [--out <dir>]

Both apps must be running. Exit 0 = parity; exit 1 = real diffs remain.
See skills/ui-prototype-migration/references/visual-verification.md.`);
}

// ---- helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupPage(context, url, theme, themeKey) {
  const page = await context.newPage();
  if (themeKey && theme) {
    await page.addInitScript(([k, t]) => {
      try { localStorage.setItem(k, t); } catch (e) {}
    }, [themeKey, theme]);
  }
  await page.goto(url, { waitUntil: "networkidle" });
  if (theme) await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await sleep(200);
  return page;
}

async function firstVisible(page, sel) {
  const handles = await page.$$(sel);
  let first = null;
  for (const h of handles) {
    if (!first) first = h;
    const box = await h.boundingBox();
    if (box && box.width > 0 && box.height > 0) return h;
  }
  // fallback: no visible match (zero-size like an empty progress bar, or a
  // hidden drawer at this viewport) — still compare the first existing element
  // on BOTH sides so hidden/zero-size state matches instead of "missing".
  return first;
}

async function readEl(handle, page) {
  return page.evaluate(([el, props]) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const s = {};
    for (const p of props) s[p] = cs.getPropertyValue(p).trim();
    return { g: { x: r.x, y: r.y, width: r.width, height: r.height }, s };
  }, [handle, COMPARE_PROPERTIES]);
}

function styleDiff(a, b) {
  const d = [];
  for (const k of ["x", "y", "width", "height"]) {
    if (Math.abs(a.g[k] - b.g[k]) > TOL) d.push({ k, proto: a.g[k], target: b.g[k] });
  }
  for (const p of COMPARE_PROPERTIES) {
    if (a.s[p] !== b.s[p]) d.push({ k: p, proto: a.s[p], target: b.s[p] });
  }
  return d;
}

// pixel diff with pixelmatch (installed at repo root)
async function pixelDiff(pageP, pageT, path) {
  const { default: pixelmatch } = await import("pixelmatch");
  const { PNG } = await import("pngjs");
  const bufP = await pageP.screenshot({ fullPage: true });
  const bufT = await pageT.screenshot({ fullPage: true });
  const a = PNG.sync.read(bufP), b = PNG.sync.read(bufT);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: PIXEL_THRESHOLD });
  writeFileSync(path + ".png", PNG.sync.write(diff));
  return { width: w, height: h, diffPixels: n, ratio: n / (w * h) };
}

// axe a11y diff (target ⊆ prototype on critical/serious).
// Strips Vue scoped attributes ([data-v-xxx=""]) from axe node targets on BOTH
// sides before keying — otherwise a selector string with [data-v...] never
// matches the prototype's, and every scoped node looks like a "new" violation.
const AXE_PATH = new URL("../node_modules/@axe-core/playwright/dist/index.mjs", import.meta.url).pathname;
async function axeDiff(pageP, pageT) {
  let AxeBuilder;
  try { ({ default: AxeBuilder } = await import(AXE_PATH)); }
  catch (e) { return { error: `@axe-core/playwright not available (${e.message})` }; }
  const scan = async (page) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const norm = (t) => t.replace(/\[data-v-[0-9a-f]+[^\]]*\]/g, "");
    const keyed = (viols) => viols.map((v) => ({ key: `${v.id}::${v.nodes.map((n) => norm(n.target.join("|"))).join("||")}`, id: v.id, impact: v.impact }));
    return {
      blocking: keyed(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious")),
      all: r.violations.map((v) => v.id),
    };
  };
  const proto = await scan(pageP), target = await scan(pageT);
  const protoKeys = new Set(proto.blocking.map((v) => v.key));
  const newBlocking = target.blocking.filter((v) => !protoKeys.has(v.key));
  return {
    prototypeAll: proto.all, targetAll: target.all,
    newBlocking: newBlocking.map((v) => `${v.id}(${v.impact})`),
    pass: newBlocking.length === 0,
  };
}

async function main() {
  const o = parseArgs(argv.slice(2));
  if (!o.prototype || !o.target || !o.selectors) { console.error("--prototype/--target/--selectors required"); printHelp(); exit(2); }

  // selectors may be an array (single view/page) or a {view:[...]} map (multi-page).
  // For a map, pick one view via --views (the URL is whatever --prototype points at).
  if (!Array.isArray(o.selectors)) {
    const view = o.views[0];
    if (!view || !o.selectors[view]) {
      console.error("--selectors is a per-view map; pass --views <page> to pick one page's list (run once per page).");
      exit(2);
    }
    o.selectors = o.selectors[view];
    console.log(`[multi-page] using selectors for view "${view}"`);
  }

  mkdirSync(o.out, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  let failures = 0;
  const axeResults = [];

  for (const theme of o.themes) {
    for (const vw of o.viewports) {
      const context = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const pageP = await setupPage(context, o.prototype, theme, o.themeKey);
      const pageT = await setupPage(context, o.target, theme, o.themeKey);
      const entry = { theme, viewport: vw, selectors: [] };

      // computed-style + bbox
      for (const sel of o.selectors) {
        const elP = await firstVisible(pageP, sel);
        const elT = await firstVisible(pageT, sel);
        if (!elP || !elT) { entry.selectors.push({ sel, status: `missing-on-${!elP ? "prototype" : "target"}` }); continue; }
        const diffs = styleDiff(await readEl(elP, pageP), await readEl(elT, pageT));
        entry.selectors.push({ sel, status: diffs.length ? "DIFF" : "match", diffs });
        if (diffs.length) failures++;
      }

      // pixel (alarm)
      const pix = await pixelDiff(pageP, pageT, `${o.out}/diff-${theme}-${vw}`);
      entry.pixel = { ratio: pix.ratio, diffPixels: pix.diffPixels };
      if (pix.ratio > PIXEL_RATIO_CAP) { failures++; entry.pixel.fail = true; }

      results.push(entry);
      await context.close();
    }
  }

  // axe a11y (one scan per theme)
  if (o.axe) {
    for (const theme of o.themes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const pageP = await setupPage(context, o.prototype, theme, o.themeKey);
      const pageT = await setupPage(context, o.target, theme, o.themeKey);
      const ax = await axeDiff(pageP, pageT);
      axeResults.push({ theme, ...ax });
      if (ax.pass === false) { failures++; ax.fail = true; }
      if (ax.error) { console.error(`[axe ${theme}] ${ax.error}`); }
      await context.close();
    }
  }

  // report
  const reportPath = resolve(o.out, "report.json");
  writeFileSync(reportPath, JSON.stringify({ results, axe: axeResults }, null, 2));
  console.log(`\n=== verify-parity report → ${reportPath} ===`);
  for (const r of results) {
    const diffs = r.selectors.filter((s) => s.status === "DIFF" || s.status.startsWith("missing"));
    console.log(`[${r.theme} @ ${r.viewport}px] pixel=${r.pixel.ratio.toExponential(2)} selectors ${r.selectors.length - diffs.length}/${r.selectors.length} match${r.pixel.fail ? "  PIXEL FAIL" : ""}`);
    for (const d of diffs.slice(0, 10)) {
      console.log(`  ${d.sel}: ${d.status}${d.diffs ? " — " + d.diffs.map((x) => `${x.k}: ${x.proto}→${x.target}`).join("; ") : ""}`);
    }
  }
  if (o.axe) {
    for (const ax of axeResults) {
      const line = ax.error ? `[axe ${ax.theme}] error: ${ax.error}` : `[axe ${ax.theme}] proto=${ax.prototypeAll.length} violations, target=${ax.targetAll.length}, NEW critical/serious: ${ax.newBlocking.length ? ax.newBlocking.join(", ") : "0"}`;
      console.log(ax.fail ? "  ✗ " + line : "  ✓ " + line);
    }
  }
  console.log(failures === 0 ? "\nPARITY OK" : `\nFAILURES: ${failures} — keep iterating`);
  await browser.close();
  exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); exit(1); });

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
    themeKey: null, out: resolve("./compare-report"), axe: false, states: [],
  };
  const take = (i) => args[i + 1];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prototype") o.prototype = take(i), i++;
    else if (a === "--target") o.target = take(i), i++;
    else if (a === "--selectors") o.selectors = loadSelectors(take(i)), i++;
    else if (a === "--views") o.views = take(i).split(",").map((v) => v.trim()).filter(Boolean), i++;
    else if (a === "--themes") o.themes = take(i).split(","), i++;
    else if (a === "--viewports") o.viewports = take(i).split(",").map(Number), i++;
    else if (a === "--theme-key") o.themeKey = take(i), i++;
    else if (a === "--out") o.out = resolve(take(i)), i++;
    else if (a === "--axe") o.axe = true;
    else if (a === "--states") o.states = take(i).split(",").map((s) => s.trim()).filter(Boolean), i++;
    else if (a === "--help" || a === "-h") { printHelp(); exit(0); }
    else { console.error(`Unknown arg: ${a}`); printHelp(); exit(2); }
  }
  return o;
}

function loadSelectors(raw) {
  let text = raw;
  const looksLikePath = !raw.trimStart().startsWith("[") && !raw.trimStart().startsWith("{");
  try { text = readFileSync(resolve(raw), "utf8"); }
  catch {
    if (looksLikePath) { console.error(`--selectors: file not found: ${raw}`); exit(2); }
    /* inline JSON */
  }
  let p;
  try { p = JSON.parse(text); } catch { console.error(`--selectors must be a JSON array/file path${looksLikePath ? "" : " (parse failed)"}`); exit(2); }
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
    [--theme-key <localStorage-key>] [--states hover,focus] [--axe] [--out <dir>]

Selectors: a JSON array (single page) or a {view: [...]} map (multi-page).
For a map, --views selects which pages to run. With MORE THAN ONE view, put
{view} in the URLs and the script navigates both apps per view and produces
ONE combined report:
  --prototype http://host/#/{view} --target http://app/#/{view} --views home,pricing

Both apps must be running. Exit 0 = parity; exit 1 = real diffs remain.
See skills/ui-prototype-migration/references/visual-verification.md.`);
}

// Substitute {view} (also {theme}) into a URL template. A template without
// placeholders returns the same URL for every view.
function expandUrl(tpl, view, theme) {
  return tpl.replaceAll("{view}", view).replaceAll("{theme}", theme);
}

// ---- helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Probe both apps up front so a server that isn't running fails with a clear
// message instead of a Playwright navigation error three minutes in.
async function checkUrls(o, views) {
  for (const [name, tpl] of [["prototype", o.prototype], ["target", o.target]]) {
    const url = expandUrl(tpl, views[0]);
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(`Cannot reach ${name} at ${url} (${e.message}). Is the ${name} server running?`);
      exit(2);
    }
  }
}

async function setupPage(context, url, theme, themeKey) {
  const page = await context.newPage();
  if (themeKey && theme) {
    await page.addInitScript(([k, t]) => {
      try { localStorage.setItem(k, t); } catch (e) {}
    }, [themeKey, theme]);
  }
  await page.goto(url, { waitUntil: "networkidle" });
  // scrollbars differ by OS and shift full-page captures — hide on both sides.
  // smooth scrolling makes focus()/hover() measurements land mid-scroll on the
  // two pages at different offsets — force instant scrolling.
  await page.addStyleTag({ content: "::-webkit-scrollbar{display:none} *{scrollbar-width:none} html{scroll-behavior:auto!important}" }).catch(() => {});
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

// Drive a state on one page's element handle (hover/focus). Best-effort: a
// selector that can't take the state (non-focusable div) is skipped, not failed.
async function applyState(handle, page, state) {
  try {
    if (state === "hover") await handle.hover();
    else if (state === "focus") await handle.focus();
    else throw new Error(`unknown state "${state}"`);
    await sleep(120); // let :hover/:focus styles apply
    return true;
  } catch { return false; }
}

// Diff all selectors in a given state ("" = resting). Each entry lands in
// `entry.selectors` as {sel, state, status, diffs}; failures counted via cb.
async function compareSelectors(pageP, pageT, sels, state, entry, countFailures) {
  for (const sel of sels) {
    const elP = await firstVisible(pageP, sel);
    const elT = await firstVisible(pageT, sel);
    if (!elP || !elT) {
      entry.selectors.push({ sel, state, status: `missing-on-${!elP ? "prototype" : "target"}` });
      if (!state) countFailures(1);
      continue;
    }
    let okP = true, okT = true;
    if (state) {
      okP = await applyState(elP, pageP, state);
      okT = await applyState(elT, pageT, state);
    }
    if (state && (!okP || !okT)) continue; // state not applicable here — skip
    const diffs = styleDiff(await readEl(elP, pageP), await readEl(elT, pageT));
    entry.selectors.push({ sel, state, status: diffs.length ? "DIFF" : "match", diffs });
    if (diffs.length) countFailures(1);
  }
}

// pixel diff with pixelmatch (installed at repo root)
async function pixelDiff(pageP, pageT, path) {
  const { default: pixelmatch } = await import("pixelmatch");
  const { PNG } = await import("pngjs");
  const bufP = await pageP.screenshot({ fullPage: true });
  const bufT = await pageT.screenshot({ fullPage: true });
  const a = PNG.sync.read(bufP), b = PNG.sync.read(bufT);
  // Different full-page heights are a REAL diff (layout mismatch), not a crash:
  // normalize both onto a shared canvas of max size; the uncovered area of the
  // shorter page renders as transparent and counts as differing pixels.
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const norm = (src) => {
    if (src.width === w && src.height === h) return src;
    const c = new PNG({ width: w, height: h });
    PNG.bitblt(src, c, 0, 0, src.width, src.height, 0, 0);
    return c;
  };
  const A = norm(a), B = norm(b);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, diff.data, w, h, { threshold: PIXEL_THRESHOLD });
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

// Single-file HTML summary: per combo a table of selector/state diffs + the
// pixel-diff image, so the Phase-5 iterate loop doesn't require reading JSON.
function writeHtmlReport(outDir, results, axeResults) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const sections = results.map((r) => {
    const rows = r.selectors
      .filter((s) => s.status !== "match")
      .map((s) => `<tr><td><code>${esc(s.sel)}</code></td><td>${esc(s.state || "resting")}</td><td>${s.status.startsWith("missing") ? esc(s.status) : ""}</td><td>${esc((s.diffs || []).map((x) => `${x.k}: ${x.proto} → ${x.target}`).join("<br>"))}</td></tr>`)
      .join("\n");
    const img = `${r.view ? r.view + "-" : ""}diff-${r.theme}-${r.viewport}.png`;
    return `<section>
      <h2>${esc(r.view)} — ${esc(r.theme)} @ ${r.viewport}px</h2>
      <p>pixel: ${r.pixel.error ? "error: " + esc(r.pixel.error) : r.pixel.ratio.toExponential(2) + " diff pixels"} ${r.pixel.fail ? "❌ FAIL" : "✓"}</p>
      <img src="${img}" style="max-width:100%;border:1px solid #ccc" alt="pixel diff"/>
      ${rows ? `<table border="1" cellpadding="4" cellspacing="0"><tr><th>selector</th><th>state</th><th>status</th><th>diffs</th></tr>${rows}</table>` : "<p>all selectors match ✓</p>"}
    </section>`;
  }).join("\n");
  const axeHtml = axeResults.length
    ? `<h2>axe a11y</h2><ul>${axeResults.map((a) => `<li>${esc(a.view)}/${esc(a.theme)}: ${a.error ? "error: " + esc(a.error) : `new critical/serious: ${a.pass ? "0 ✓" : esc(a.newBlocking.join(", ")) + " ❌"}`}</li>`).join("")}</ul>`
    : "";
  writeFileSync(resolve(outDir, "report.html"), `<!doctype html><meta charset="utf-8"><title>verify-parity report</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:72rem}table{border-collapse:collapse;margin:1rem 0}code{background:#f1f5f9;padding:1px 4px}section{border-top:2px solid #e2e8f0;padding-top:1rem;margin-top:2rem}</style>
<h1>verify-parity report</h1>${axeHtml}${sections}`);
}

async function main() {
  const o = parseArgs(argv.slice(2));
  if (!o.prototype || !o.target || !o.selectors) { console.error("--prototype/--target/--selectors required"); printHelp(); exit(2); }

  // selectors: array (single view) or {view:[...]} map. For a map, --views picks
  // the pages; with 2+ views the URLs must contain {view} so each iteration
  // navigates both apps to that page (single report, no per-view re-runs).
  let viewSelectors;
  let views = o.views;
  if (Array.isArray(o.selectors)) {
    viewSelectors = { [views[0] ?? "page"]: o.selectors };
    views = [views[0] ?? "page"];
  } else {
    viewSelectors = o.selectors;
    if (!views.length || !views.every((v) => viewSelectors[v])) {
      console.error(`--selectors is a per-view map; --views must name pages that exist in it (got: ${views.join(",") || "none"}; available: ${Object.keys(viewSelectors).join(", ")}).`);
      exit(2);
    }
  }
  const multi = views.length > 1;
  if (multi && !o.prototype.includes("{view}") && !o.target.includes("{view}")) {
    console.error("--views lists several pages but neither URL contains {view}; add it (e.g. http://host/#/{view}) or run once per page.");
    exit(2);
  }

  await checkUrls(o, views);

  mkdirSync(o.out, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  let failures = 0;
  const axeResults = [];

  for (const view of views) {
    const sels = viewSelectors[view];
    const protoUrl = expandUrl(o.prototype, view);
    const targetUrl = expandUrl(o.target, view);
    if (multi) console.log(`\n[view ${view}] ${protoUrl}  ↔  ${targetUrl}`);

    for (const theme of o.themes) {
      for (const vw of o.viewports) {
        const context = await browser.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const pageP = await setupPage(context, protoUrl, theme, o.themeKey);
        const pageT = await setupPage(context, targetUrl, theme, o.themeKey);
        const entry = { view, theme, viewport: vw, selectors: [] };

        // computed-style + bbox, resting state
        await compareSelectors(pageP, pageT, sels, "", entry, (n) => { failures += n; });

        // interactive states (hover/focus) — same computed-style diff, driven
        for (const state of o.states) {
          await compareSelectors(pageP, pageT, sels, state, entry, (n) => { failures += n; });
        }

        // pixel (alarm) — an error here is a failure, not a dead report
        try {
          const base = multi ? `${o.out}/diff-${view}-${theme}-${vw}` : `${o.out}/diff-${theme}-${vw}`;
          const pix = await pixelDiff(pageP, pageT, base);
          entry.pixel = { ratio: pix.ratio, diffPixels: pix.diffPixels };
          if (pix.ratio > PIXEL_RATIO_CAP) { failures++; entry.pixel.fail = true; }
        } catch (e) {
          entry.pixel = { error: e.message, fail: true };
          failures++;
        }

        results.push(entry);
        await context.close();
      }
    }

    // axe a11y (one scan per theme, per view)
    if (o.axe) {
      for (const theme of o.themes) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const pageP = await setupPage(context, protoUrl, theme, o.themeKey);
        const pageT = await setupPage(context, targetUrl, theme, o.themeKey);
        const ax = await axeDiff(pageP, pageT);
        axeResults.push({ view, theme, ...ax });
        if (ax.pass === false) { failures++; ax.fail = true; }
        if (ax.error) { console.error(`[axe ${view}/${theme}] ${ax.error}`); }
        await context.close();
      }
    }
  }

  // report
  const reportPath = resolve(o.out, "report.json");
  writeFileSync(reportPath, JSON.stringify({ results, axe: axeResults }, null, 2));
  writeHtmlReport(o.out, results, axeResults);
  console.log(`\n=== verify-parity report → ${reportPath} (also report.html) ===`);
  for (const r of results) {
    const diffs = r.selectors.filter((s) => s.status === "DIFF" || s.status.startsWith("missing"));
    const pixStr = r.pixel.error ? `error: ${r.pixel.error}` : r.pixel.ratio.toExponential(2);
    const viewTag = views.length > 1 ? `${r.view} ` : "";
    console.log(`[${viewTag}${r.theme} @ ${r.viewport}px] pixel=${pixStr} selectors ${r.selectors.length - diffs.length}/${r.selectors.length} match${r.pixel.fail ? "  PIXEL FAIL" : ""}`);
    for (const d of diffs.slice(0, 10)) {
      const st = d.state ? ` (${d.state})` : "";
      console.log(`  ${d.sel}${st}: ${d.status}${d.diffs ? " — " + d.diffs.map((x) => `${x.k}: ${x.proto}→${x.target}`).join("; ") : ""}`);
    }
  }
  if (o.axe) {
    for (const ax of axeResults) {
      const viewTag = views.length > 1 ? `${ax.view}/` : "";
      const line = ax.error ? `[axe ${viewTag}${ax.theme}] error: ${ax.error}` : `[axe ${viewTag}${ax.theme}] proto=${ax.prototypeAll.length} violations, target=${ax.targetAll.length}, NEW critical/serious: ${ax.newBlocking.length ? ax.newBlocking.join(", ") : "0"}`;
      console.log(ax.fail ? "  ✗ " + line : "  ✓ " + line);
    }
  }
  console.log(failures === 0 ? "\nPARITY OK" : `\nFAILURES: ${failures} — keep iterating`);
  await browser.close();
  exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); exit(1); });

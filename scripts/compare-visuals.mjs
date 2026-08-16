#!/usr/bin/env node
// compare-visuals.mjs
//
// Visual-fidelity diagnosis for UI prototype migration.
// Loads a PROTOTYPE url and a TARGET url at one or more viewports, then for a
// list of selectors present on both pages compares:
//   - bounding box (x, y, width, height)   -> catches layout/geometry drift
//   - a curated set of computed CSS values   -> catches the exact property that drifted
// and also captures full-page screenshots of both for manual pixel comparison.
//
// It is the DIAGNOSIS half of verification (tells you *which* value differs).
// Use screenshot review as the ALARM half (tells you *that* something differs).
// See references/visual-verification.md.
//
// Requires the `playwright` npm package and a installed browser.
//   npm i -D playwright && npx playwright install chromium

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { argv, exit } from "node:process";

// ---- Configuration ------------------------------------------------------------

// Computed properties to compare. These are the properties whose values most
// often drift during a migration. Add/remove to fit the prototype; each entry is
// compared as the RESOLVED value (what the user sees), not the authored token.
const COMPARE_PROPERTIES = [
  "width",
  "height",
  "padding",
  "margin",
  "border-width",
  "border-color",
  "border-radius",
  "gap",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "box-shadow",
  "display",
  "position",
  "flex-direction",
  "align-items",
  "justify-content",
];

// Viewports to test. Defaults cover a desktop, a tablet, and a phone width.
// Override with --viewports. IMPORTANT: use the prototype's OWN breakpoints,
// not generic Tailwind breakpoints — drift often hides just inside a breakpoint.
const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 760, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];

// Floating-point tolerance for geometry comparison, in CSS pixels. Sub-pixel
// rounding from browser layout is normal; a real migration drift is usually
// several pixels. Raise this if your environment produces layout noise.
const GEOMETRY_TOLERANCE_PX = 0.5;

// -----------------------------------------------------------------------------

function parseArgs(args) {
  const opts = {
    prototype: null,
    target: null,
    selectors: null,
    viewports: DEFAULT_VIEWPORTS,
    outDir: resolve("./compare-report"),
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--prototype":
        opts.prototype = args[++i];
        break;
      case "--target":
        opts.target = args[++i];
        break;
      case "--selectors": {
        const raw = args[++i];
        opts.selectors = loadSelectors(raw);
        break;
      }
      case "--viewports":
        opts.viewports = parseViewports(args[++i]);
        break;
      case "--out":
        opts.outDir = resolve(args[++i]);
        break;
      case "--help":
      case "-h":
        printHelp();
        exit(0);
      default:
        console.error(`Unknown argument: ${a}`);
        printHelp();
        exit(2);
    }
  }
  return opts;
}

// Accepts either a path to a JSON file (an array of selectors) or an inline
// JSON array string. Always returns an array of selector strings.
function loadSelectors(raw) {
  if (!raw) return null;
  let text = raw;
  try {
    text = readFileSync(resolve(raw), "utf8");
  } catch {
    // not a file path — treat as inline JSON
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(`Could not parse --selectors as JSON: ${e.message}`);
    exit(2);
  }
  if (!Array.isArray(parsed)) {
    console.error("--selectors must be a JSON array of selector strings");
    exit(2);
  }
  return parsed;
}

function parseViewports(csv) {
  return csv.split(",").map((w) => {
    const width = Number.parseInt(w.trim(), 10);
    if (!Number.isFinite(width)) {
      console.error(`Invalid viewport width: ${w}`);
      exit(2);
    }
    return { name: `w${width}`, width, height: 900 };
  });
}

function printHelp() {
  console.log(`compare-visuals.mjs — prototype vs. target visual diff

Usage:
  node compare-visuals.mjs \\
    --prototype http://localhost:5173 \\
    --target    http://localhost:3000 \\
    --selectors selectors.json \\
    [--viewports 1280,760,375] \\
    [--out ./compare-report]

Options:
  --prototype URL   Running URL of the ORIGINAL prototype (source of truth).
  --target URL      Running URL of the MIGRATED implementation.
  --selectors PATH  JSON array of selectors that exist on BOTH pages,
                    e.g. [".stat-card", ".btn--primary", ".sidebar"].
                    May also be an inline JSON array string.
  --viewports CSV   Comma-separated viewport widths in px (uses the prototype's
                    own breakpoints). Default: 1280,760,375
  --out DIR         Where to write the JSON report + screenshots.
                    Default: ./compare-report

Both apps must already be running. The script does not start servers.

Setup (one time):
  npm i -D playwright && npx playwright install chromium
`);
}

// Extract the resolved values we care about for one element handle.
async function readElement(handle, page) {
  return page.evaluate(
    ([el, props]) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const out = { geometry: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, styles: {} };
      for (const p of props) out.styles[p] = cs.getPropertyValue(p).trim();
      return out;
    },
    [handle, COMPARE_PROPERTIES]
  );
}

function diffGeometry(a, b) {
  const out = [];
  for (const k of ["x", "y", "width", "height"]) {
    const d = Math.abs(a.geometry[k] - b.geometry[k]);
    if (d > GEOMETRY_TOLERANCE_PX) {
      out.push({ property: k, prototype: a.geometry[k], target: b.geometry[k], delta: b.geometry[k] - a.geometry[k] });
    }
  }
  return out;
}

function diffStyles(a, b) {
  const out = [];
  for (const p of COMPARE_PROPERTIES) {
    const pv = a.styles[p];
    const tv = b.styles[p];
    if (pv !== tv) {
      out.push({ property: p, prototype: pv, target: tv });
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (!opts.prototype || !opts.target || !opts.selectors) {
    console.error("Error: --prototype, --target and --selectors are all required.\n");
    printHelp();
    exit(2);
  }

  mkdirSync(opts.outDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error(
      `Could not launch Chromium via Playwright: ${e.message}\n` +
        `Install it first:\n  npm i -D playwright && npx playwright install chromium`
    );
    exit(1);
  }

  const report = { prototype: opts.prototype, target: opts.target, viewports: [] };

  for (const vp of opts.viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const pageP = await context.newPage();
    const pageT = await context.newPage();

    await pageP.goto(opts.prototype, { waitUntil: "networkidle" });
    await pageT.goto(opts.target, { waitUntil: "networkidle" });

    // Screenshots for manual pixel comparison (the ALARM half).
    const shotP = resolve(opts.outDir, `prototype-${vp.name}-${vp.width}.png`);
    const shotT = resolve(opts.outDir, `target-${vp.name}-${vp.width}.png`);
    await pageP.screenshot({ path: shotP, fullPage: true });
    await pageT.screenshot({ path: shotT, fullPage: true });

    const vpReport = { name: vp.name, width: vp.width, screenshots: { prototype: shotP, target: shotT }, selectors: [] };

    for (const selector of opts.selectors) {
      const entry = { selector, status: "ok", geometryDiffs: [], styleDiffs: [] };
      const elP = await pageP.$(selector);
      const elT = await pageT.$(selector);
      if (!elP || !elT) {
        entry.status = `missing-on-${!elP ? "prototype" : "target"}`;
        vpReport.selectors.push(entry);
        continue;
      }
      const dataP = await readElement(elP, pageP);
      const dataT = await readElement(elT, pageT);
      entry.geometryDiffs = diffGeometry(dataP, dataT);
      entry.styleDiffs = diffStyles(dataP, dataT);
      if (entry.geometryDiffs.length === 0 && entry.styleDiffs.length === 0) {
        entry.status = "match";
      }
      vpReport.selectors.push(entry);
    }

    report.viewports.push(vpReport);
    await context.close();
  }

  await browser.close();

  const reportPath = resolve(opts.outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  printSummary(report, reportPath);

  // Exit non-zero if any selector is not an exact match (diffs OR missing on
  // either side — a missing element is at least as bad as a drifted one).
  const hasDiffs = report.viewports.some((vp) =>
    vp.selectors.some((s) => s.status !== "match")
  );
  exit(hasDiffs ? 1 : 0);
}

function printSummary(report, reportPath) {
  console.log("\n=== Visual comparison summary ===");
  console.log(`prototype: ${report.prototype}`);
  console.log(`target:    ${report.target}`);
  let totalDiffs = 0;
  for (const vp of report.viewports) {
    console.log(`\n[viewport ${vp.name} @ ${vp.width}px]`);
    console.log(`  screenshots: ${vp.screenshots.prototype}`);
    console.log(`               ${vp.screenshots.target}`);
    for (const s of vp.selectors) {
      if (s.status === "match") {
        console.log(`  ✓ ${s.selector} — match`);
      } else if (s.status.startsWith("missing")) {
        console.log(`  ! ${s.selector} — ${s.status}`);
      } else {
        totalDiffs++;
        console.log(`  ✗ ${s.selector}`);
        for (const g of s.geometryDiffs) {
          console.log(`      ${g.property}: ${g.prototype} → ${g.target} (Δ${g.delta > 0 ? "+" : ""}${g.delta.toFixed(2)}px)`);
        }
        for (const st of s.styleDiffs) {
          console.log(`      ${st.property}: "${st.prototype}" → "${st.target}"`);
        }
      }
    }
  }
  console.log(`\nFull JSON report: ${reportPath}`);
  console.log(totalDiffs === 0 ? "No computed-style/geometry differences found (still review screenshots manually)." : `${totalDiffs} selector(s) with differences.`);
}

main().catch((e) => {
  console.error(e);
  exit(1);
});

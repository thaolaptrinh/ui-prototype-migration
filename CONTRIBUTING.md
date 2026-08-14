# Contributing to ui-prototype-migration

Thanks for wanting to contribute. This project is maintained as an
agent-skill/plugin for Claude Code and Codex, and the repository is
documentation-first: `skills/ui-prototype-migration/SKILL.md` is the index,
`references/` hold the detailed methodology, and `scripts/` the verification
harness.

Read [README.md](README.md) first for the full picture — especially the core
stance: **a migration preserves the prototype's exact rendered output; it does
not redesign it.** Every contribution has to respect that.

---

## Before you start

- **Create an issue first** for anything non-trivial (behavioral change, new
  workflow phase, new framework reference). Small fixes and docs can go
  straight to a PR.
- **Work on a branch** — never commit directly to `main`.
- **Keep the scope tight.** One PR = one concern.
- **Node 20+ is required** (CI runs Node 20). `npm install` at the repo root
  pulls Playwright + the parity dependencies; the first run also needs
  `npx playwright install chromium`.

---

## Version discipline

The plugin ships to two clients from two manifests that must stay in **lockstep**:

- `.claude-plugin/plugin.json` — Claude Code marketplace + plugin manifest
- `.codex-plugin/plugin.json` — Codex plugin manifest

Every PR changes the distributed plugin package (including docs- and
CI-only PRs). Bump `1.0.0` → `1.x.0` in **both** files together. Do not bump
in one without the other: release notes live in git tags / GitHub Releases at
release time, not in a file recorded in advance.

---

## Validation gates

These are the checks a PR must be green on. They also run in GitHub Actions
CI (`.github/workflows/parity.yml` covers the parity gate; extend that
workflow when you add a new repo-level check).

| What it checks | Command |
|---|---|
| Scripts parse (both legacy + unified gate) | `node --check scripts/compare-visuals.mjs && node --check scripts/verify-parity.mjs` |
| Manifests + fixtures are valid JSON | `node -e "for (const f of ['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','.codex-plugin/plugin.json','.agents/plugins/marketplace.json','package.json']) JSON.parse(require('fs').readFileSync(f))"` |
| Claude/Codex versions + metadata are in sync | compare `version` in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` |
| No stale scratch references | `grep -rn "_preview-\|_host-\|OWNER\|<your-org>" --include="*.md" --include="*.yml" --include="*.mjs" --exclude-dir=node_modules .` |
| Full parity on the fixtures | `npm run verify:parity -- --prototype http://127.0.0.1:5187 --target <url> --selectors examples/fixtures/prototype-landing/selectors.example.json` (both apps running) |

Run the cheap ones before pushing:

```bash
node --check scripts/compare-visuals.mjs && node --check scripts/verify-parity.mjs \
  && node -e "for (const f of ['.claude-plugin/plugin.json','.claude-plugin/marketplace.json','.codex-plugin/plugin.json','.agents/plugins/marketplace.json','package.json']) JSON.parse(require('fs').readFileSync(f))" \
  && grep -rn "_preview-\|_host-\|OWNER\|<your-org>" --include="*.md" --include="*.yml" --include="*.mjs" --exclude-dir=node_modules . || true
```

### If a gate fails

- **JSON/version gate:** you changed a manifest in one place only. Edit the
  sibling manifest so both remain valid and version-locked.
- **`parity.yml`:** the fixture pair you touched no longer reaches 0 real
  computed-value/geometry differences. Fix the fixture or the target — do not
  widen the threshold to dodge the failure.
- **Stale-reference grep:** you referenced a deleted scratch directory
  (`examples/_preview-*`, `examples/_host-*`). Remove the reference.

---

## Working on the skill internals

### Adding a fixture (prototype)

1. Add the prototype under `examples/fixtures/<name>/` — HTML + CSS (external,
   embedded, or inline) + assets + any JS behavior + `selectors.example.json`
   (a JSON array, or a `{view: [selectors]}` map for multi-page fixtures).
2. Document it in `examples/fixtures/README.md` (shape, style, what it
   stresses).
3. Verify parity against a migrated target and include the evidence in the
   PR description.

### Changing the methodology

`skills/ui-prototype-migration/SKILL.md` is the source of truth; `references/`
hold the depth. When you change a rule:

- Keep SKILL.md the concise index and put the rationale in the matching
  reference (`css-preservation.md`, `componentization.md`,
  `visual-verification.md`, `framework/<name>.md`).
- Update `commands/` and the README **in the same PR** — they describe the
  same workflow and drift silently.
- If the change alters what "parity" means, update
  `scripts/verify-parity.mjs` and `.github/workflows/parity.yml` together.

### Adding a framework

The first-supported target is Vue 3 (`references/framework/vue.md`). For a new
framework, add `references/framework/<name>.md` following the same structure
and extend SKILL.md's activation language — do not make the generic workflow
framework-specific.

---

## Commit and PR conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): summary`, e.g. `fix(parity): strip Vue scoped attrs in axe keys`,
`feat(plugin): add Codex manifest`, `docs: note the co-location re-verify`.
Keep summaries short and imperative.

A good PR:

- has a clear title and a description that says *what* changed and *why*;
- mentions how you tested it (which gates you ran);
- keeps source and generated/documented surfaces consistent in one change
  (SKILL + reference + command + README);
- is rebased on `main` and green on CI.

## Questions?

Open an issue or comment on the relevant one.
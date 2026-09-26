# Design System Skills for Claude Code (Figma-first fork)

> **This fork changes the source of truth.** Upstream is code-first (its README says code wins any disagreement). Here, **Figma is canonical**: Variables/Styles/Components → spec → implementation → audit. Skills read Figma and never write to it. Read [SOURCE-OF-TRUTH.md](SOURCE-OF-TRUTH.md) — it's short, and every skill follows it. Forked from [NewMediaStudio/design-system-skills](https://github.com/NewMediaStudio/design-system-skills) (MIT).

Open-source [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code) for managing a design system whose source of truth is **Figma**, implemented in **Code** and documented in **Storybook**. Run accessibility audits, bring code into line with Figma, track drift, and prototype from the terminal.

📖 **Read the article:** [Your Design System Is the Moat Against Product Slop](https://www.linkedin.com/pulse/your-design-system-moat-against-product-slop-guide-makhouleen-by1qe)

## What's Included

### Skills (`.claude/commands/`)

| Skill                                          | Command           | Description                                                                                                                                               |
| ---------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[DS Sync](skills/ds-sync.md)**               | `/ds-sync`        | Pull Figma into code — renders each Storybook component, compares it to its Figma counterpart, applies token fixes to CSS and proposes structural fixes. Never writes to Figma |
| **[DS WCAG](skills/ds-wcag.md)**               | `/ds-wcag`        | WCAG 2.1 Level AA accessibility audit — source analysis, axe-core, keyboard testing, dual-theme contrast checks, and an auto-fix loop                    |
| **[DS Report](skills/ds-report.md)**           | `/ds-report`      | Cross-reference Code, Storybook, and Figma to produce a parity report with drift scores and historical benchmarks                                         |
| **[DS Proto](skills/ds-proto.md)**             | `/ds-proto`       | Prototype layouts using your existing design system components with accessibility guardrails                                                              |
| **[DS Spec](skills/ds-spec.md)**               | `/ds-spec`        | Generate structured component specs from the Figma component — anatomy, API, tokens, structure, accessibility — and check code against them                                                 |
| **[DS Tokens](skills/ds-tokens.md)**           | `/ds-tokens`      | Validate CSS tokens against Figma variables (Figma is correct) — detects mismatches, missing tokens, orphaned variables, and generates `.claude/ds-token-map.json`    |
| **[DS Usage](skills/ds-usage.md)**             | `/ds-usage`       | Scan the codebase for component adoption, shadow copies, override patterns, and unused components — outputs per-team adoption metrics                     |
| **[DS Lifecycle](skills/ds-lifecycle.md)**     | `/ds-lifecycle`   | Track component lifecycle stages (proposed → alpha → beta → stable → deprecated → removed), enforce promotion criteria, and generate deprecation notices |
| **[DS Design MD](skills/ds-design-md.md)**     | `/ds-design-md`   | Generate a `DESIGN.md` from Figma variables and text styles (read live by default; `--no-figma` is a labelled fallback), cross-checked against code — readable by any AI agent and compliant with the [google-labs-code/design.md](https://github.com/google-labs-code/design.md) spec (`--spec` flag) |
| **[DS Audit Figma](skills/ds-audit-figma.md)** | `/ds-audit-figma` | Figma-to-Storybook visual parity audit — per-component and per-variant screenshot diff, property extraction, drift scoring, and mapping health check     |
| **[DS Diff](skills/ds-diff.md)**               | `/ds-diff`        | Compare `DESIGN.md` token values across git refs — surfaces color shifts, contrast regressions, and removed tokens before they ship                      |
| **[DS Export](skills/ds-export.md)**           | `/ds-export`      | Convert `DESIGN.md` front matter tokens to Tailwind config, W3C DTCG JSON, Style Dictionary, or CSS custom properties                                   |
| **[DS Brand](skills/ds-brand.md)**             | `/ds-brand`       | Fork a `DESIGN.md` into a brand variant by overriding tokens, then validate WCAG contrast on the result                                                  |
| **[Storybook](skills/storybook.md)**           | `/storybook`      | Launch your Storybook dev server                                                                                                                          |

### Rules (`.claude/rules/`)

| File                                           | Description                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **[accessibility.md](rules/accessibility.md)** | Comprehensive WCAG 2.1 Level AA criteria — semantic HTML, ARIA, keyboard, contrast, touch targets, component checklists |

### Guides

| Guide                                                          | Description                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **[Getting Started](guides/getting-started.md)**               | End-to-end setup: Figma MCP, Storybook, mapping file, and your first sync                        |
| **[DS Registry](guides/ds-registry.md)**                       | Unified JSON registry — one file for all component, story, Figma, and token metadata             |
| **[Mapping File](guides/mapping-file.md)**                     | How to create and maintain the Figma-to-Storybook mapping JSON                                   |
| **[Code Connect](guides/code-connect.md)**                     | Optional: link production components to Figma Dev Mode and the MCP server via Figma Code Connect |
| **[CI Integration](guides/ci-integration.md)**                 | Run DS skills in CI — WCAG gates, drift thresholds, shadow copy detection, and PR comments       |
| **[Component Versioning](guides/component-versioning.md)**     | Semantic versioning for DS components, codemods, deprecation notices, and migration guides       |
| **[Multi-Brand](guides/multi-brand.md)**                       | Run skills across multiple brands or themes — per-brand token maps, Figma files, and CI matrix   |
| **[DESIGN.md](guides/design-md.md)**                           | How DESIGN.md works, what it contains, and how to keep it in sync with your design system        |

### Templates

| Template                                                                 | Description                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **[ds-registry.json](templates/ds-registry.example.json)**               | Example DS Registry with component, story, Figma, and token metadata |
| **[ds-story-figma-map.json](templates/ds-story-figma-map.example.json)** | Example mapping file connecting Storybook stories to Figma node IDs  |
| **[ds-benchmarks.json](templates/ds-benchmarks.example.json)**           | Example benchmark file for tracking drift over time                  |
| **[launch.json](templates/launch.example.json)**                         | Example Claude Code server launch config for Storybook               |
| **[settings.json](templates/settings.example.json)**                     | Example Claude Code settings with auto-formatting hooks              |

---

## Quick Start

### 1. Install the skills

Copy the skills you want into your project's `.claude/commands/` directory:

```bash
# Clone this repo
git clone https://github.com/MUZEEBURRAHAMAN/design-system-skills.git

# Copy everything into your project
cp design-system-skills/skills/*.md your-project/.claude/commands/
cp design-system-skills/rules/*.md your-project/.claude/rules/
cp design-system-skills/SOURCE-OF-TRUTH.md your-project/   # the policy every skill links to
```

Or cherry-pick individual skills:

```bash
# Just the accessibility audit
cp design-system-skills/skills/ds-wcag.md your-project/.claude/commands/
cp design-system-skills/rules/accessibility.md your-project/.claude/rules/
```

### 2. Set up the prerequisites

See the **[Getting Started Guide](guides/getting-started.md)** for full setup. Three required pieces:

1. **Figma Console MCP** — the source of truth; install the [Figma Console MCP server](https://github.com/nicholasrq/figma-console) and the Desktop Bridge plugin
2. **Storybook** — running on `localhost:6006` (or your configured port)
3. **Mapping file** — create `.claude/ds-story-figma-map.json` linking your Storybook stories to Figma node IDs

### 3. Run a skill

```bash
# Audit accessibility on all components
/ds-wcag

# Audit a component and auto-fix what can be fixed
/ds-wcag Button --fix

# Run a dual-theme contrast audit only
/ds-wcag --themes-only

# Run a full parity report
/ds-report

# Bring Button's implementation into line with Figma
/ds-sync Button

# Validate CSS ↔ Figma token parity and generate token map
/ds-tokens --generate

# Scan the codebase for adoption, shadow copies, and overrides
/ds-usage --teams

# Check component lifecycle status and flag overdue promotions
/ds-lifecycle audit

# Promote a component when it meets all stable criteria
/ds-lifecycle promote DatePicker

# Deprecate a component and generate migration notices
/ds-lifecycle deprecate LegacyAlert

# Generate a DESIGN.md for use in Cursor, Lovable, Google Stitch
/ds-design-md --root

# Generate google-labs-code/design.md spec-compliant file (YAML front matter + canonical sections + lint)
/ds-design-md --spec --root

# Degraded, code-only fallback (labelled as such)
/ds-design-md --no-figma --root

# Full Figma-to-Storybook visual parity audit with per-variant diffs
/ds-audit-figma --variants --themes

# Diff DESIGN.md token values against main (post result to open PR)
/ds-diff main --pr

# Export tokens to Tailwind config and W3C DTCG JSON
/ds-export tailwind w3c

# Fork DESIGN.md into a brand variant and validate contrast
/ds-brand partner --colors '{"primary":"#e11d48","background":"#0f172a"}'

# Prototype a new feature
/ds-proto "dashboard with metric cards and filters"

# Generate a structured spec for a component
/ds-spec Button

# Spec a component that's designed in Figma but not built yet
/ds-spec RatingStars
```

---

## Architecture

Figma is the source of truth. The flow only runs one way:

```
Figma Variables, Styles, Components
        ▼   (read only)
Machine-readable spec   (ds-spec, ds-design-md, ds-registry)
        ▼
React / Storybook implementation
        ▼
Automated audit   (ds-audit-figma, ds-report, ds-tokens, ds-wcag) — compares code back against Figma
```

**Figma is canonical.** When code/Storybook and Figma disagree, Figma is correct and the finding is "the implementation drifted." Fixes target CSS token files and component source — never a Figma node. A component that exists in Figma but not yet in code is a first-class registry entry (`presence.inCode: false`), not an outlier.

**Claude Code bridges them.** Via MCP servers, Claude reads Figma through the Desktop Bridge, renders and inspects Storybook, and proposes or applies code-side fixes. Six guardrails (no Figma writes, no duplicate components, no hard-coded values, no arbitrary overrides, no unapproved architecture changes, Figma-only components are first-class) are in [SOURCE-OF-TRUTH.md](SOURCE-OF-TRUTH.md).

**[Figma Code Connect](guides/code-connect.md)** is optional. It records which code implements each Figma component in Dev Mode and the MCP server; Figma's own variant/property definitions stay canonical. All skills work without it.

### The Mapping File

`.claude/ds-story-figma-map.json` connects every Figma component to its Storybook stories. Without it, every comparison is a guess. A section entry with no `sourceFile` is a component designed in Figma and not built yet. See the [Mapping File Guide](guides/mapping-file.md) for how to create one.

### The DS Registry

On a 50-component DS, each skill run reads ~85 files: barrel exports, component sources, story files, the Figma map, token CSS. The **DS Registry** (`.claude/ds-registry.json`) collapses all of that into a single JSON file, enumerated from Figma first and merged with code. Skills load it in one read. It's generated by a TypeScript script and auto-syncs via a `prestorybook` hook. See the [DS Registry Guide](guides/ds-registry.md) and the [generation script](scripts/generate-ds-registry.ts).

### Drift Scoring

The `/ds-report` skill tracks design system health over time:

```
Component Drift % = (1 - fullParityCount / totalUniqueComponents) × 100   (Figma components not yet built count as drift)
Token Drift %     = (|codeTokens - figmaTokens| / max(codeTokens, figmaTokens)) × 100
Icon Drift %      = (|codeIcons - figmaIcons| / max(codeIcons, figmaIcons)) × 100
Overall Drift %   = 60% × Component + 25% × Token + 15% × Icon
```

Target: **0% drift.** Every run is benchmarked and stored for trend analysis.

---

## Repository checks

```bash
npm install
npm run check    # tsc --strict + source-of-truth rules + fixture tests
```

Tests cover the registry/presence logic against a fixture project (with a golden file), the snapshot-freshness checker (`scripts/check-snapshot.mjs`), and every source-of-truth rule, each proven by injecting its violation. In your own CI, run `node scripts/check-snapshot.mjs` before `/ds-report --snapshot` (see [CI Integration](guides/ci-integration.md)).

## Customisation

Adapt these skills to your project. Common changes:

### File Paths

Update these paths in the skills to match your project structure:

| Default                           | What It Is                      | Where to Change                 |
| --------------------------------- | ------------------------------- | ------------------------------- |
| `packages/ds/src/main.tsx`        | DS barrel export                | `ds-report.md`, `ds-proto.md`   |
| `packages/ds/stories/`            | Story file location             | `ds-report.md`, `ds-wcag.md`    |
| `packages/ds/src/styles/`         | Token/CSS files                 | `ds-sync.md`, `ds-proto.md`     |
| `apps/*/src/`                     | Application code                | `ds-sync.md`, `ds-proto.md`     |
| `design-system-manifest.json`     | Component inventory             | All skills                      |
| `.claude/ds-story-figma-map.json` | Figma mapping                   | All skills                      |
| `.claude/ds-registry.json`        | Unified DS registry (generated) | All skills (optional fast path) |

### Token Architecture

The skills assume CSS custom properties as design tokens:

```css
:root {
  --primary-foreground: #1a1a1a;
  --surface-background: #ffffff;
}
.dark {
  --primary-foreground: #f5f5f5;
  --surface-background: #1a1a1a;
}
```

For Style Dictionary JSON, Tailwind config, or other token formats, update the token-loading sections in `ds-sync.md` and `ds-proto.md`.

### Storybook Port

Default is `localhost:6006`. If your Storybook runs on a different port, update `launch.json` and the `storybookBase` URL in your mapping file.

---

## Prerequisites

| Tool                                                             | Required For                              | Installation                                     |
| ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code)    | All skills                                | `npm install -g @anthropic-ai/claude-code`       |
| [Figma Console MCP](https://github.com/nicholasrq/figma-console) | Every skill that reads Figma (sync, tokens, design-md, spec, audit, report) | See [Getting Started](guides/getting-started.md) |
| [Figma Desktop](https://www.figma.com/downloads/)                | Figma skills                              | Download from Figma                              |
| [Storybook](https://storybook.js.org/)                           | All skills                                | Part of your project                             |
| [Figma Code Connect](https://github.com/figma/code-connect)      | Optional: richer MCP context              | `npm install --save-dev @figma/code-connect`     |
| [design.md CLI](https://github.com/google-labs-code/design.md)   | Optional: lint, diff, export for `--spec` | `npm install --save-dev design.md`               |

---

## Contributing

Contributions welcome. Built a skill for your design system workflow? Open a PR.

### Adding a Skill

1. Create a `.md` file in `skills/`
2. Use the frontmatter format: `---\ndescription: Short description\n---`
3. Keep skills generic: no product names, proprietary tokens, or internal URLs
4. Reference config files by their `.claude/` paths
5. Update this README

---

## License

MIT

---

## Author

Designed by [Valentine Makhouleen](https://www.linkedin.com/in/newmediadesign/)

## Credits

Built on the work of:

- [Figma Console MCP](https://github.com/nicholasrq/figma-console) by TJ Pitre / Southleft
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
- [Stop Slop](https://github.com/hardikpandya/stop-slop) by Hardik Pandya — skill for voice, tone, and product copy that strips AI tells from prose
